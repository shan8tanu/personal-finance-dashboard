import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import prisma from "../db";
import { parseBankStatement, parseCreditCardStatement, parseXlsBankStatement } from "../services/pdfParser";
import { autoCategorize } from "../services/categorizer";
import { applyTaggingRules } from "../services/taggingEngine";

const upload = multer({ dest: path.join(__dirname, "..", "..", "uploads") });
const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

router.post("/bank-statement", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const { password, accountId } = req.body;

  // Create or find the account
  let account;
  if (accountId) {
    account = await prisma.account.findUnique({ where: { id: accountId } });
  }
  if (!account) {
    // Auto-create savings account if not provided — use deterministic ID for dedup
    account = await prisma.account.upsert({
      where: { id: "default-savings" },
      update: {},
      create: {
        id: "default-savings",
        name: "HDFC Savings",
        type: "savings",
        accountNumberMasked: "XXXXXXXX8085",
        bankName: "HDFC",
      },
    });
  }

  const pdfUpload = await prisma.pdfUpload.create({
    data: {
      accountId: account.id,
      filename: req.file.originalname,
      status: "processing",
    },
  });

  try {
    // Detect file type by extension and route to the right parser
    const ext = path.extname(req.file.originalname).toLowerCase();
    const isXls = ext === ".xls" || ext === ".xlsx";
    const result = isXls
      ? await parseXlsBankStatement(req.file.path)
      : await parseBankStatement(req.file.path, password);
    let importedCount = 0;

    for (const t of result.transactions) {
      const { categoryId } = await autoCategorize(t.description, t.counterparty);

      try {
        await prisma.transaction.upsert({
          where: {
            accountId_referenceNumber: {
              accountId: account.id,
              referenceNumber: t.referenceNumber,
            },
          },
          update: {
            description: t.description,
            amount: t.amount,
            type: t.type,
            counterparty: t.counterparty,
            closingBalance: t.closingBalance,
            date: new Date(t.date),
            source: "pdf_import",
            ...(categoryId && { categoryId }),
          },
          create: {
            accountId: account.id,
            date: new Date(t.date),
            description: t.description,
            amount: t.amount,
            type: t.type,
            referenceNumber: t.referenceNumber,
            closingBalance: t.closingBalance,
            source: "pdf_import",
            counterparty: t.counterparty,
            categoryId,
          },
        });
        importedCount++;
      } catch (e: any) {
        console.error(`Failed to import transaction: ${t.referenceNumber}`, e.message);
      }
    }

    // Apply user tagging rules after import
    await applyTaggingRules();

    await prisma.pdfUpload.update({
      where: { id: pdfUpload.id },
      data: {
        status: "completed",
        transactionsImported: importedCount,
        periodStart: result.metadata?.periodStart ? new Date(result.metadata.periodStart) : null,
        periodEnd: result.metadata?.periodEnd ? new Date(result.metadata.periodEnd) : null,
      },
    });

    res.json({
      success: true,
      imported: importedCount,
      total: result.transactions.length,
      uploadId: pdfUpload.id,
    });
  } catch (error: any) {
    await prisma.pdfUpload.update({
      where: { id: pdfUpload.id },
      data: { status: "failed", errorMessage: error.message },
    });
    res.status(error.status || 500).json({ error: error.message });
  } finally {
    // Clean up uploaded file
    fs.unlink(req.file.path, () => {});
  }
});

router.post("/credit-card-statement", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const { accountId } = req.body;

  let account;
  if (accountId) {
    account = await prisma.account.findUnique({ where: { id: accountId } });
  }
  if (!account) {
    account = await prisma.account.upsert({
      where: { id: "default-cc" },
      update: {},
      create: {
        id: "default-cc",
        name: "HDFC Regalia Gold",
        type: "credit_card",
        accountNumberMasked: "XXXXXX3570",
        bankName: "HDFC",
      },
    });
  }

  const pdfUpload = await prisma.pdfUpload.create({
    data: {
      accountId: account.id,
      filename: req.file.originalname,
      status: "processing",
    },
  });

  try {
    const result = await parseCreditCardStatement(req.file.path);

    // Create credit card statement record
    let statement = null;
    if (result.metadata) {
      statement = await prisma.creditCardStatement.create({
        data: {
          accountId: account.id,
          statementDate: new Date(result.metadata.statementDate),
          billingPeriodStart: new Date(result.metadata.billingPeriodStart),
          billingPeriodEnd: new Date(result.metadata.billingPeriodEnd),
          totalDue: result.metadata.totalDue,
          minimumDue: result.metadata.minimumDue,
          dueDate: new Date(result.metadata.dueDate),
          rewardPoints: result.metadata.rewardPoints || 0,
        },
      });
    }

    let importedCount = 0;

    for (const t of result.transactions) {
      const { categoryId } = await autoCategorize(t.description, t.counterparty);

      try {
        await prisma.transaction.upsert({
          where: {
            accountId_referenceNumber: {
              accountId: account.id,
              referenceNumber: t.referenceNumber,
            },
          },
          update: {
            description: t.description,
            amount: t.amount,
            type: t.type,
            counterparty: t.counterparty,
            isInternational: t.isInternational || false,
            date: new Date(t.date),
            source: "pdf_import",
            ...(categoryId && { categoryId }),
            ...(statement && { statementId: statement.id }),
          },
          create: {
            accountId: account.id,
            date: new Date(t.date),
            description: t.description,
            amount: t.amount,
            type: t.type,
            referenceNumber: t.referenceNumber,
            source: "pdf_import",
            counterparty: t.counterparty,
            isInternational: t.isInternational || false,
            categoryId,
            ...(statement && { statementId: statement.id }),
          },
        });
        importedCount++;
      } catch (e: any) {
        console.error(`Failed to import CC transaction: ${t.referenceNumber}`, e.message);
      }
    }

    await applyTaggingRules();

    await prisma.pdfUpload.update({
      where: { id: pdfUpload.id },
      data: {
        status: "completed",
        transactionsImported: importedCount,
        periodStart: result.metadata?.billingPeriodStart ? new Date(result.metadata.billingPeriodStart) : null,
        periodEnd: result.metadata?.billingPeriodEnd ? new Date(result.metadata.billingPeriodEnd) : null,
      },
    });

    res.json({
      success: true,
      imported: importedCount,
      total: result.transactions.length,
      statementId: statement?.id,
      uploadId: pdfUpload.id,
    });
  } catch (error: any) {
    await prisma.pdfUpload.update({
      where: { id: pdfUpload.id },
      data: { status: "failed", errorMessage: error.message },
    });
    res.status(error.status || 500).json({ error: error.message });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

// POST /api/upload/json — import a pre-parsed output.json from local reviewParse workflow
// Body: { transactions: [...], type: "bank" | "cc" }
router.post("/json", async (req: Request, res: Response) => {
  const { transactions, type } = req.body as {
    transactions: any[];
    type?: "bank" | "cc";
  };

  if (!Array.isArray(transactions) || transactions.length === 0) {
    res.status(400).json({ error: "No transactions in request body" });
    return;
  }

  const isCC = type === "cc";
  const accountId = isCC ? "default-cc" : "default-savings";
  const accountDef = isCC
    ? { name: "HDFC Regalia Gold", type: "credit_card", accountNumberMasked: "XXXXXX3570", bankName: "HDFC" }
    : { name: "HDFC Savings", type: "savings", accountNumberMasked: "XXXXXXXX8085", bankName: "HDFC" };

  const account = await prisma.account.upsert({
    where: { id: accountId },
    update: {},
    create: { id: accountId, ...accountDef },
  });

  let imported = 0;
  let skipped = 0;
  let categorized = 0;
  const errors: string[] = [];

  for (const t of transactions) {
    // Strip parser metadata fields before DB insert
    const { _confidence, isEmi, ...txData } = t;

    const { categoryId } = await autoCategorize(txData.description, txData.counterparty);
    if (categoryId) categorized++;

    try {
      await prisma.transaction.upsert({
        where: { accountId_referenceNumber: { accountId: account.id, referenceNumber: txData.referenceNumber } },
        update: {
          description:    txData.description,
          amount:         txData.amount,
          type:           txData.type,
          counterparty:   txData.counterparty,
          closingBalance: txData.closingBalance ?? null,
          date:           new Date(txData.date),
          source:         "pdf_import",
          ...(categoryId && { categoryId }),
        },
        create: {
          accountId:       account.id,
          date:            new Date(txData.date),
          description:     txData.description,
          amount:          txData.amount,
          type:            txData.type,
          referenceNumber: txData.referenceNumber,
          closingBalance:  txData.closingBalance ?? null,
          source:          "pdf_import",
          counterparty:    txData.counterparty,
          isInternational: txData.isInternational ?? false,
          categoryId,
        },
      });
      imported++;
    } catch (e: any) {
      skipped++;
      errors.push(`${txData.referenceNumber}: ${e.message}`);
    }
  }

  const tagged = await applyTaggingRules();

  res.json({
    success: true,
    imported,
    skipped,
    categorized,
    tagged,
    ...(errors.length > 0 && { errors: errors.slice(0, 10) }),
  });
});

export default router;

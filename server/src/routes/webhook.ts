import { Router, Request, Response } from "express";
import { webhookAuth } from "../middleware/auth";
import prisma from "../db";
import { autoCategorize } from "../services/categorizer";

const router = Router();

// Parse HDFC SMS format
function parseHdfcSms(message: string): {
  amount: number;
  type: "debit" | "credit";
  account: string;
  reference: string;
  date: string;
} | null {
  // Pattern: INR/Rs/Rs. 1,234.56 debited from A/c/a/c **8085 on 01-04-26
  const debitMatch = message.match(
    /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*debited\s*from\s*(?:A\/c|a\/c)\s*\*+(\d+)\s*on\s*(\d{2}-\d{2}-\d{2})/i
  );
  if (debitMatch) {
    const refMatch = message.match(/(?:UPI\s*Ref|Ref\s*No)[:\s]*(\d+)/i);
    return {
      amount: parseFloat(debitMatch[1].replace(/,/g, "")),
      type: "debit",
      account: debitMatch[2],
      reference: refMatch ? refMatch[1] : `SMS-${Date.now()}`,
      date: debitMatch[3],
    };
  }

  // Pattern: INR/Rs/Rs. 1,234.56 credited to A/c/a/c **8085
  const creditMatch = message.match(
    /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*credited\s*to\s*(?:A\/c|a\/c)\s*\*+(\d+)\s*on\s*(\d{2}-\d{2}-\d{2})/i
  );
  if (creditMatch) {
    const refMatch = message.match(/(?:UPI\s*Ref|Ref\s*No)[:\s]*(\d+)/i);
    return {
      amount: parseFloat(creditMatch[1].replace(/,/g, "")),
      type: "credit",
      account: creditMatch[2],
      reference: refMatch ? refMatch[1] : `SMS-${Date.now()}`,
      date: creditMatch[3],
    };
  }

  return null;
}

router.post("/sms", webhookAuth, async (req: Request, res: Response) => {
  const { message, sender, timestamp } = req.body;

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const parsed = parseHdfcSms(message);
  if (!parsed) {
    res.status(422).json({ error: "Could not parse SMS format" });
    return;
  }

  // Find matching account
  const account = await prisma.account.findFirst({
    where: { accountNumberMasked: { contains: parsed.account } },
  });

  if (!account) {
    res.status(404).json({ error: `No account found matching **${parsed.account}` });
    return;
  }

  const { categoryId } = await autoCategorize(message);

  // Parse date from DD-MM-YY format
  const [day, month, year] = parsed.date.split("-");
  const fullYear = parseInt(year) > 50 ? 1900 + parseInt(year) : 2000 + parseInt(year);
  const date = new Date(fullYear, parseInt(month) - 1, parseInt(day));

  const transaction = await prisma.transaction.upsert({
    where: {
      accountId_referenceNumber: {
        accountId: account.id,
        referenceNumber: parsed.reference,
      },
    },
    update: {},  // Don't overwrite if already exists from PDF
    create: {
      accountId: account.id,
      date,
      description: message.substring(0, 200),
      amount: parsed.amount,
      type: parsed.type,
      referenceNumber: parsed.reference,
      source: "sms_webhook",
      categoryId,
    },
  });

  res.status(201).json({ success: true, transactionId: transaction.id });
});

export default router;

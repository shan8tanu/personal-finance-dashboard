import { Router, Request, Response } from "express";
import { webhookAuth, jwtAuth } from "../middleware/auth";
import prisma from "../db";
import { autoCategorize } from "../services/categorizer";

const router = Router();

// Parse HDFC SMS format — returns null if format not recognized
function parseHdfcSms(message: string): {
  amount: number;
  type: "debit" | "credit";
  account: string;
  reference: string;
  date: string;
  description: string;
  counterparty?: string;
} | null {
  // Extract "Info: <narration>" field present in UPI / NEFT / IMPS SMS
  const infoMatch = message.match(/Info:\s*(.+?)(?:\.\s*(?:UPI Ref|Avl Bal)|$)/i);
  const narration = infoMatch ? infoMatch[1].trim() : "";

  // Derive a human-readable counterparty from the narration
  let counterparty: string | undefined;

  // UPI: "UPI-MERCHANT NAME-merchant@bank"  →  "MERCHANT NAME"
  const upiMatch = narration.match(/UPI-(.+?)(?:-[\w.]+@\w+|-\d{9,}|$)/i);
  if (upiMatch) {
    // Handle occasional CamelCase merchant names
    counterparty = upiMatch[1].replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  }

  // ATM / cash withdrawal (no Info field)
  if (!counterparty && /ATM|NWD/i.test(message)) {
    counterparty = "ATM Withdrawal";
  }

  // NEFT / IMPS: "NEFTDR-BANKCODE-NAME-..." or "IMPS-12345-NAME"
  if (!counterparty) {
    const neftMatch = narration.match(/(?:NEFT|IMPS)[DC]?R?-\w+-(.+?)(?:-|$)/i);
    if (neftMatch) counterparty = neftMatch[1].trim();
  }

  // ── Debit pattern ─────────────────────────────────────────────────────────
  // "INR 1,234.56 debited from A/c **8085 on 26-04-26"
  const debitMatch = message.match(
    /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*debited\s*from\s*(?:A\/c|a\/c)\s*\*+(\d+)\s*on\s*(\d{2}-\d{2}-\d{2})/i
  );
  if (debitMatch) {
    const refMatch = message.match(/(?:UPI\s*Ref|Ref\s*No)[:\s]*(\d+)/i);
    return {
      amount:      parseFloat(debitMatch[1].replace(/,/g, "")),
      type:        "debit",
      account:     debitMatch[2],
      reference:   refMatch ? refMatch[1] : `SMS-${Date.now()}`,
      date:        debitMatch[3],
      description: narration || message.substring(0, 200),
      counterparty,
    };
  }

  // ── Credit pattern ────────────────────────────────────────────────────────
  // "INR 5,000.00 credited to A/c **8085 on 26-04-26"
  const creditMatch = message.match(
    /(?:INR|Rs\.?)\s*([\d,]+\.?\d*)\s*credited\s*to\s*(?:A\/c|a\/c)\s*\*+(\d+)\s*on\s*(\d{2}-\d{2}-\d{2})/i
  );
  if (creditMatch) {
    const refMatch = message.match(/(?:UPI\s*Ref|Ref\s*No)[:\s]*(\d+)/i);
    return {
      amount:      parseFloat(creditMatch[1].replace(/,/g, "")),
      type:        "credit",
      account:     creditMatch[2],
      reference:   refMatch ? refMatch[1] : `SMS-${Date.now()}`,
      date:        creditMatch[3],
      description: narration || message.substring(0, 200),
      counterparty,
    };
  }

  return null;
}

// POST /api/webhook/sms — called by Tasker / MacroDroid on every HDFC transaction SMS
router.post("/sms", webhookAuth, async (req: Request, res: Response) => {
  // Accept both "message" (preferred) and "body" (Tasker's default %SMSRB variable name)
  const message: string = req.body.message || req.body.body;

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const parsed = parseHdfcSms(message);
  if (!parsed) {
    res.status(422).json({ error: "Could not parse SMS format" });
    return;
  }

  // Match account by last 4 digits in the masked account number
  const account = await prisma.account.findFirst({
    where: { accountNumberMasked: { contains: parsed.account } },
  });

  if (!account) {
    res.status(404).json({ error: `No account found matching **${parsed.account}` });
    return;
  }

  const { categoryId } = await autoCategorize(parsed.description, parsed.counterparty);

  // Parse date: DD-MM-YY → Date object
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
    update: {},  // Don't overwrite if transaction was already imported from a PDF statement
    create: {
      accountId:       account.id,
      date,
      description:     parsed.description,
      amount:          parsed.amount,
      type:            parsed.type,
      referenceNumber: parsed.reference,
      source:          "sms_webhook",
      counterparty:    parsed.counterparty,
      categoryId,
    },
  });

  res.status(201).json({ success: true, transactionId: transaction.id });
});

// GET /api/webhook/config — returns the webhook secret for display in Settings UI
// Protected by JWT (browser auth) so only the logged-in owner can read it
router.get("/config", jwtAuth, (_req: Request, res: Response) => {
  const secret = process.env.WEBHOOK_SECRET || "";
  res.json({ secret });
});

export default router;

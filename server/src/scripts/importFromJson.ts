#!/usr/bin/env ts-node
/**
 * importFromJson.ts
 *
 * Import transactions from a parser output JSON file directly into the database.
 * Use after reviewParse.ts has generated a reviewed output.json.
 *
 * Usage:
 *   npx ts-node src/scripts/importFromJson.ts --file output.json --type bank
 *   npx ts-node src/scripts/importFromJson.ts --file output.json --type cc
 *   npx ts-node src/scripts/importFromJson.ts --file output.json --type bank --dry-run
 */

import fs from "fs";
import path from "path";
import prisma from "../db";
import { autoCategorize } from "../services/categorizer";
import { applyTaggingRules } from "../services/taggingEngine";

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  referenceNumber: string;
  closingBalance?: number;
  counterparty?: string;
  isInternational?: boolean;
  isEmi?: boolean;
  _confidence?: string;
}

async function main() {
  const args     = process.argv.slice(2);
  const fileIdx  = args.indexOf("--file");
  const typeIdx  = args.indexOf("--type");
  const dryRun   = args.includes("--dry-run");

  if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error("Usage: importFromJson.ts --file <json> --type bank|cc [--dry-run]");
    process.exit(1);
  }

  const filePath    = args[fileIdx + 1];
  const accountType = typeIdx !== -1 ? args[typeIdx + 1] : "bank";

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw   = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const txns: ParsedTransaction[] = raw.transactions || raw;

  if (!Array.isArray(txns) || txns.length === 0) {
    console.error("No transactions found in file.");
    process.exit(1);
  }

  // Find or create account
  const isCC       = accountType === "cc";
  const accountId  = isCC ? "default-cc" : "default-savings";
  const accountDef = isCC
    ? { name: "HDFC Regalia Gold", type: "credit_card", accountNumberMasked: "XXXXXX3570", bankName: "HDFC" }
    : { name: "HDFC Savings",      type: "savings",     accountNumberMasked: "XXXXXXXX8085", bankName: "HDFC" };

  if (dryRun) {
    console.log(`\n[DRY RUN] Would import ${txns.length} transactions into account: ${accountDef.name}`);
    const sample = txns.slice(0, 5);
    for (const t of sample) {
      console.log(`  ${t.date}  ${t.type.padEnd(6)}  ₹${t.amount.toLocaleString("en-IN")}  ${t.description.substring(0, 50)}`);
    }
    if (txns.length > 5) console.log(`  ... and ${txns.length - 5} more`);
    console.log();
    return;
  }

  const account = await prisma.account.upsert({
    where:  { id: accountId },
    update: {},
    create: { id: accountId, ...accountDef },
  });

  let imported    = 0;
  let skipped     = 0;
  let categorized = 0;
  const errors: string[] = [];

  console.log(`\nImporting ${txns.length} transactions into: ${account.name}`);

  for (const t of txns) {
    // Strip parser metadata before DB insert
    const { _confidence, isEmi, ...txData } = t as any;

    const { categoryId } = await autoCategorize(txData.description, txData.counterparty);
    if (categoryId) categorized++;

    try {
      await prisma.transaction.upsert({
        where: {
          accountId_referenceNumber: {
            accountId: account.id,
            referenceNumber: txData.referenceNumber,
          },
        },
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
          accountId:      account.id,
          date:           new Date(txData.date),
          description:    txData.description,
          amount:         txData.amount,
          type:           txData.type,
          referenceNumber: txData.referenceNumber,
          closingBalance: txData.closingBalance ?? null,
          source:         "pdf_import",
          counterparty:   txData.counterparty,
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

  // Apply tagging rules after all inserts
  const tagged = await applyTaggingRules();

  console.log(`\n  Done!`);
  console.log(`  Imported     : ${imported}`);
  console.log(`  Skipped/dups : ${skipped}`);
  console.log(`  Auto-categorized: ${categorized}`);
  console.log(`  Rules applied   : ${tagged}`);
  if (errors.length > 0) {
    console.log(`\n  Errors (${errors.length}):`);
    errors.slice(0, 10).forEach(e => console.log(`    ${e}`));
  }
  console.log();

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

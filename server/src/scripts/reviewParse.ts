#!/usr/bin/env ts-node
/**
 * reviewParse.ts
 *
 * Parses a bank statement PDF, shows only transactions where the parser
 * was uncertain (confidence = "guessed" or "corrected"), lets you confirm
 * or flip each one, then saves new patterns to type_corrections.json.
 *
 * Usage:
 *   npx ts-node src/scripts/reviewParse.ts --file path/to/statement.pdf [--password 123]
 *   npx ts-node src/scripts/reviewParse.ts --file path/to/statement.pdf --all   (show all)
 */

import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import readline from "readline";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
  referenceNumber: string;
  closingBalance?: number;
  counterparty?: string;
  _confidence?: "verified" | "guessed" | "corrected";
}

interface Correction {
  pattern: string;
  type: "debit" | "credit";
  note: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const PARSER_SCRIPT   = path.join(__dirname, "../parsers/parse_bank_statement.py");
const CORRECTIONS_FILE = path.join(__dirname, "../parsers/type_corrections.json");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

function loadCorrections(): Correction[] {
  if (!fs.existsSync(CORRECTIONS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CORRECTIONS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveCorrections(corrections: Correction[]): void {
  fs.writeFileSync(CORRECTIONS_FILE, JSON.stringify(corrections, null, 2));
}

function runParser(filePath: string, password?: string): Promise<ParsedTransaction[]> {
  return new Promise((resolve, reject) => {
    const args = [PARSER_SCRIPT, filePath, "--show-confidence"];
    if (password) args.push("--password", password);

    execFile("python", args, { maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        if (stderr.includes("InvalidPassword")) return reject(new Error("Invalid PDF password"));
        return reject(new Error(`Parser error: ${stderr || err.message}`));
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result.transactions || []);
      } catch {
        reject(new Error("Could not parse script output"));
      }
    });
  });
}

async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args  = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const passIdx = args.indexOf("--password");
  const showAll = args.includes("--all");

  if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error("Usage: reviewParse.ts --file <pdf> [--password <pwd>] [--all]");
    process.exit(1);
  }

  const filePath = args[fileIdx + 1];
  const password = passIdx !== -1 ? args[passIdx + 1] : undefined;

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  console.log(`\nParsing: ${path.basename(filePath)} ...`);
  const transactions = await runParser(filePath, password);

  const uncertain = showAll
    ? transactions
    : transactions.filter(t => t._confidence === "guessed" || t._confidence === "corrected");

  const total     = transactions.length;
  const verified  = transactions.filter(t => t._confidence === "verified").length;

  console.log(`\n  Total transactions : ${total}`);
  console.log(`  Verified by balance: ${verified}`);
  console.log(`  Needs review       : ${uncertain.length}`);

  if (uncertain.length === 0) {
    console.log("\n  All transactions verified. No review needed.\n");
    // Still write the full output.json
    fs.writeFileSync("output.json", JSON.stringify({ transactions }, null, 2));
    console.log("  output.json written.\n");
    return;
  }

  const corrections = loadCorrections();
  const newCorrections: Correction[] = [];
  const flipped: ParsedTransaction[] = [];

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\n─────────────────────────────────────────────────────────────");
  console.log(" Reviewing uncertain transactions. Options: y (keep) / n (flip) / s (skip)");
  console.log("─────────────────────────────────────────────────────────────\n");

  for (let i = 0; i < uncertain.length; i++) {
    const t = uncertain[i];
    const badge = t._confidence === "corrected" ? "[balance-corrected]" : "[guessed]";
    console.log(`[${i + 1}/${uncertain.length}] ${t.date}  ${t.description.substring(0, 50)}`);
    console.log(`      ${formatINR(t.amount)}  ${t.type.toUpperCase().padEnd(6)}  ${badge}`);
    if (t.closingBalance) console.log(`      Closing balance: ${formatINR(t.closingBalance)}`);

    const ans = (await prompt(rl, `      Keep as ${t.type.toUpperCase()}? [y/n/s] → `)).trim().toLowerCase();

    if (ans === "n") {
      const newType: "debit" | "credit" = t.type === "debit" ? "credit" : "debit";
      console.log(`      → Flipped to ${newType.toUpperCase()}`);
      t.type = newType;
      flipped.push(t);

      // Offer to save as a pattern
      const saveRule = (await prompt(rl, `      Save as a correction rule? [y/n] → `)).trim().toLowerCase();
      if (saveRule === "y") {
        // Extract a useful pattern from the description
        const words = t.description.split(/[\s-]+/).filter(w => w.length > 3);
        const suggestedPattern = words.slice(0, 2).join("-").substring(0, 30);
        const patternInput = (await prompt(rl, `      Pattern [${suggestedPattern}]: `)).trim();
        const pattern = patternInput || suggestedPattern;
        const note    = (await prompt(rl, `      Note (optional): `)).trim();

        // Don't duplicate
        const alreadyExists = corrections.some(c => c.pattern.toUpperCase() === pattern.toUpperCase());
        if (!alreadyExists) {
          newCorrections.push({ pattern, type: newType, note });
          console.log(`      ✓ Rule saved: "${pattern}" → ${newType}`);
        } else {
          console.log(`      (rule already exists for "${pattern}")`);
        }
      }
    } else if (ans === "s") {
      console.log("      → Skipped");
    } else {
      console.log(`      → Kept as ${t.type.toUpperCase()}`);
    }
    console.log();
  }

  rl.close();

  // Save corrections
  if (newCorrections.length > 0) {
    const updated = [...corrections, ...newCorrections];
    saveCorrections(updated);
    console.log(`\n  Saved ${newCorrections.length} new rule(s) to type_corrections.json`);
  }

  // Write output.json with corrections applied
  fs.writeFileSync("output.json", JSON.stringify({ transactions }, null, 2));

  console.log(`\n  Summary:`);
  console.log(`    Reviewed  : ${uncertain.length}`);
  console.log(`    Flipped   : ${flipped.length}`);
  console.log(`    New rules : ${newCorrections.length}`);
  console.log(`    output.json written — ${transactions.length} transactions ready to import\n`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

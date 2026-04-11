/**
 * Removes duplicate March 2026 transactions.
 *
 * Root cause: the monthly March 2026 statement AND the full historical PDF were
 * both imported. Each import generated different reference numbers for the same
 * underlying transactions (the historical PDF uses a numeric ref from the
 * statement; the monthly PDF uses an md5 hash). The unique constraint is on
 * (accountId, referenceNumber), so both slipped through.
 *
 * Strategy:
 *   1. Group by (date, amount, type, accountId).
 *   2. Within each group of >1, keep the one whose referenceNumber looks numeric
 *      (historical PDF), delete the hash-looking one(s).
 *   3. If all refs look like hashes, keep the oldest createdAt and delete the rest.
 */

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = path.resolve(__dirname, "..", "dev.db");
const adapter = new PrismaBetterSqlite3({ url: "file:" + dbPath });
const prisma = new PrismaClient({ adapter });

function looksNumeric(ref: string): boolean {
  return /^\d+$/.test(ref.replace(/[/-]/g, ""));
}

async function main() {
  const march = await prisma.transaction.findMany({
    where: {
      date: { gte: new Date("2026-03-01"), lt: new Date("2026-04-01") },
    },
    orderBy: [{ date: "asc" }, { amount: "asc" }, { createdAt: "asc" }],
  });

  console.log(`March 2026 transactions total: ${march.length}`);

  // Group by (accountId, date-day, amount, type)
  const groups = new Map<string, typeof march>();
  for (const tx of march) {
    const day = tx.date.toISOString().split("T")[0];
    const key = `${tx.accountId}|${day}|${tx.amount}|${tx.type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
  }

  const dupGroups = [...groups.values()].filter((g) => g.length > 1);
  console.log(`Duplicate groups found: ${dupGroups.length}`);

  const toDelete: string[] = [];

  for (const group of dupGroups) {
    // Sort: numeric refs first, then by createdAt asc (keep oldest)
    group.sort((a, b) => {
      const aNum = looksNumeric(a.referenceNumber) ? 0 : 1;
      const bNum = looksNumeric(b.referenceNumber) ? 0 : 1;
      if (aNum !== bNum) return aNum - bNum;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const [keep, ...deleteCandidates] = group;
    console.log(
      `  KEEP  id=${keep.id.slice(0, 8)} ref=${keep.referenceNumber} | ${keep.date.toISOString().split("T")[0]} ₹${keep.amount} ${keep.type}`
    );
    for (const d of deleteCandidates) {
      console.log(
        `  DEL   id=${d.id.slice(0, 8)} ref=${d.referenceNumber}`
      );
      toDelete.push(d.id);
    }
  }

  if (toDelete.length === 0) {
    console.log("Nothing to delete — no duplicates found.");
    return;
  }

  const { count } = await prisma.transaction.deleteMany({
    where: { id: { in: toDelete } },
  });
  console.log(`\nDeleted ${count} duplicate transaction(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

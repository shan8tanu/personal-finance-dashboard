import prisma from "../db";

export async function applyTaggingRules(): Promise<number> {
  const rules = await prisma.taggingRule.findMany({
    orderBy: { priority: "desc" },
  });

  if (rules.length === 0) return 0;

  // Get all transactions that aren't manually categorized
  const transactions = await prisma.transaction.findMany({
    where: { isManuallyCategorized: false },
  });

  let updatedCount = 0;

  for (const transaction of transactions) {
    for (const rule of rules) {
      const fieldValue = rule.matchField === "counterparty"
        ? transaction.counterparty || ""
        : transaction.description;

      if (fieldValue.toLowerCase().includes(rule.matchPattern.toLowerCase())) {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            categoryId: rule.categoryId,
            ...(rule.tagLabel && { tag: rule.tagLabel }),
          },
        });
        updatedCount++;
        break; // First matching rule wins (highest priority first)
      }
    }
  }

  return updatedCount;
}

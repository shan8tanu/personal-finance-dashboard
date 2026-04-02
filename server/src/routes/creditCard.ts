import { Router, Request, Response } from "express";
import prisma from "../db";

const router = Router();

router.get("/statements", async (_req: Request, res: Response) => {
  const statements = await prisma.creditCardStatement.findMany({
    include: { account: true },
    orderBy: { statementDate: "desc" },
  });
  res.json(statements);
});

router.get("/statements/:id/transactions", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const transactions = await prisma.transaction.findMany({
    where: { statementId: id },
    include: { category: true },
    orderBy: { date: "desc" },
  });
  res.json(transactions);
});

router.get("/summary", async (req: Request, res: Response) => {
  const { month, year } = req.query;

  const where: any = {
    account: { type: "credit_card" },
  };

  if (month && year) {
    const startDate = new Date(parseInt(year as string), parseInt(month as string) - 1, 1);
    const endDate = new Date(parseInt(year as string), parseInt(month as string), 0, 23, 59, 59);
    where.date = { gte: startDate, lte: endDate };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true },
  });

  // Group by category
  const categoryMap: Record<string, { name: string; color: string; total: number }> = {};
  let totalSpend = 0;

  for (const t of transactions) {
    if (t.type === "credit") continue; // skip payments/refunds
    if (t.category?.type === "transfer") continue; // skip CC payments

    const catName = t.category?.name || "Uncategorized";
    const catColor = t.category?.color || "#6B7280";

    if (!categoryMap[catName]) {
      categoryMap[catName] = { name: catName, color: catColor, total: 0 };
    }
    categoryMap[catName].total += t.amount;
    totalSpend += t.amount;
  }

  res.json({
    totalSpend,
    byCategory: Object.values(categoryMap).sort((a, b) => b.total - a.total),
  });
});

export default router;

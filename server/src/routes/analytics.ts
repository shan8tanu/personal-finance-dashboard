import { Router, Request, Response } from "express";
import prisma from "../db";

const router = Router();

router.get("/category-breakdown", async (req: Request, res: Response) => {
  const { month, year, accountId } = req.query;

  if (!month || !year) {
    res.status(400).json({ error: "month and year are required" });
    return;
  }

  const startDate = new Date(parseInt(year as string), parseInt(month as string) - 1, 1);
  const endDate = new Date(parseInt(year as string), parseInt(month as string), 0, 23, 59, 59);

  const where: any = {
    date: { gte: startDate, lte: endDate },
    type: "debit",
  };
  if (accountId) where.accountId = accountId;

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true },
  });

  const categoryMap: Record<string, { name: string; type: string; color: string; total: number; count: number }> = {};

  for (const t of transactions) {
    const catName = t.category?.name || "Uncategorized";
    const catType = t.category?.type || "expense";
    const catColor = t.category?.color || "#6B7280";

    if (!categoryMap[catName]) {
      categoryMap[catName] = { name: catName, type: catType, color: catColor, total: 0, count: 0 };
    }
    categoryMap[catName].total += t.amount;
    categoryMap[catName].count += 1;
  }

  res.json(Object.values(categoryMap).sort((a, b) => b.total - a.total));
});

router.get("/monthly-trend", async (req: Request, res: Response) => {
  const { months = "6" } = req.query;
  const numMonths = parseInt(months as string, 10);

  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - numMonths + 1, 1);

  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: startDate } },
    include: { category: true },
  });

  const monthlyData: Record<string, { month: string; income: number; expenses: number; investments: number }> = {};

  for (const t of transactions) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    if (!monthlyData[key]) {
      monthlyData[key] = { month: key, income: 0, expenses: 0, investments: 0 };
    }

    const catType = t.category?.type;
    if (t.type === "credit" || catType === "income") {
      monthlyData[key].income += t.amount;
    } else if (catType === "investment") {
      monthlyData[key].investments += t.amount;
    } else if (catType === "expense") {
      monthlyData[key].expenses += t.amount;
    }
  }

  const sorted = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
  res.json(sorted);
});

export default router;

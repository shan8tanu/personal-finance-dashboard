import { Router, Request, Response } from "express";
import prisma from "../db";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const {
    accountId,
    categoryId,
    categoryType,
    type,
    startDate,
    endDate,
    search,
    minAmount,
    maxAmount,
    sortBy,
    sortDir,
    page = "1",
    limit = "50",
  } = req.query;

  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  if (accountId) where.accountId = accountId;
  if (categoryId === "uncategorized") where.categoryId = null;
  else if (categoryId) where.categoryId = categoryId;
  if (type) where.type = type;

  if (categoryType) {
    where.category = { type: categoryType };
  }

  if (startDate || endDate) {
    where.date = {};
    if (startDate) where.date.gte = new Date(startDate as string);
    if (endDate) where.date.lte = new Date(endDate as string);
  }

  if (search) {
    where.OR = [
      { description: { contains: search as string } },
      { counterparty: { contains: search as string } },
    ];
  }

  if (minAmount || maxAmount) {
    where.amount = {};
    if (minAmount) where.amount.gte = parseFloat(minAmount as string);
    if (maxAmount) where.amount.lte = parseFloat(maxAmount as string);
  }

  // Sort support
  const allowedSortFields = ["date", "amount", "type", "counterparty"];
  const orderField = allowedSortFields.includes(sortBy as string) ? (sortBy as string) : "date";
  const orderDirection = sortDir === "asc" ? "asc" : "desc";

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { category: true, account: true },
      orderBy: { [orderField]: orderDirection },
      skip,
      take: limitNum,
    }),
    prisma.transaction.count({ where }),
  ]);

  res.json({
    transactions,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

router.get("/summary", async (req: Request, res: Response) => {
  const { month, year } = req.query;

  const where: any = {};
  if (month && year) {
    where.date = {
      gte: new Date(parseInt(year as string), parseInt(month as string) - 1, 1),
      lte: new Date(parseInt(year as string), parseInt(month as string), 0, 23, 59, 59),
    };
  } else if (year) {
    where.date = {
      gte: new Date(parseInt(year as string), 0, 1),
      lte: new Date(parseInt(year as string), 11, 31, 23, 59, 59),
    };
  }
  // If neither → all time (no date filter)

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true },
  });

  let totalIncome = 0;
  let totalExpenses = 0;
  let totalInvestments = 0;

  for (const t of transactions) {
    const catType = t.category?.type;
    if (t.type === "credit" || catType === "income") {
      totalIncome += t.amount;
    } else if (catType === "investment") {
      totalInvestments += t.amount;
    } else if (catType === "expense") {
      totalExpenses += t.amount;
    }
    // transfer and fee types are excluded from these totals
  }

  res.json({
    totalIncome,
    totalExpenses,
    totalInvestments,
    netSavings: totalIncome - totalExpenses - totalInvestments,
    transactionCount: transactions.length,
  });
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { categoryId, tag, type } = req.body;

  // Validate type if provided
  if (type !== undefined && type !== "debit" && type !== "credit") {
    res.status(400).json({ error: "type must be 'debit' or 'credit'" });
    return;
  }

  const data: any = {};
  if (categoryId !== undefined) {
    data.categoryId = categoryId;
    data.isManuallyCategorized = true;
  }
  if (tag !== undefined) data.tag = tag;
  if (type !== undefined) data.type = type;

  const transaction = await prisma.transaction.update({
    where: { id },
    data,
    include: { category: true },
  });
  res.json(transaction);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await prisma.transaction.delete({ where: { id } });
  res.json({ success: true });
});

export default router;

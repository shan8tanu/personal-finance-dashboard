import { Router, Request, Response } from "express";
import prisma from "../db";
import { applyTaggingRules } from "../services/taggingEngine";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const rules = await prisma.taggingRule.findMany({
    include: { category: true },
    orderBy: { priority: "desc" },
  });
  res.json(rules);
});

router.post("/", async (req: Request, res: Response) => {
  const { matchPattern, matchField, categoryId, tagLabel, priority } = req.body;

  if (!matchPattern || !matchField || !categoryId) {
    res.status(400).json({ error: "matchPattern, matchField, and categoryId are required" });
    return;
  }

  const rule = await prisma.taggingRule.create({
    data: {
      matchPattern,
      matchField,
      categoryId,
      tagLabel: tagLabel || null,
      priority: priority || 0,
    },
    include: { category: true },
  });
  res.status(201).json(rule);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { matchPattern, matchField, categoryId, tagLabel, priority } = req.body;

  const rule = await prisma.taggingRule.update({
    where: { id },
    data: {
      ...(matchPattern && { matchPattern }),
      ...(matchField && { matchField }),
      ...(categoryId && { categoryId }),
      ...(tagLabel !== undefined && { tagLabel }),
      ...(priority !== undefined && { priority }),
    },
    include: { category: true },
  });
  res.json(rule);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await prisma.taggingRule.delete({ where: { id } });
  res.json({ success: true });
});

router.post("/apply", async (_req: Request, res: Response) => {
  const count = await applyTaggingRules();
  res.json({ updated: count });
});

router.post("/preview", async (req: Request, res: Response) => {
  const { matchPattern, matchField } = req.body;

  if (!matchPattern || !matchField) {
    res.status(400).json({ error: "matchPattern and matchField are required" });
    return;
  }

  const field = matchField === "counterparty" ? "counterparty" : "description";
  const transactions = await prisma.transaction.findMany({
    where: {
      [field]: { contains: matchPattern },
    },
    include: { category: true },
    take: 20,
  });

  res.json(transactions);
});

export default router;

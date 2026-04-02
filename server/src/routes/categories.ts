import { Router, Request, Response } from "express";
import prisma from "../db";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
  });
  res.json(categories);
});

router.post("/", async (req: Request, res: Response) => {
  const { name, type, icon, color } = req.body;
  if (!name || !type) {
    res.status(400).json({ error: "Name and type are required" });
    return;
  }

  const category = await prisma.category.create({
    data: { name, type, icon: icon || "circle", color: color || "#6B7280", isDefault: false },
  });
  res.status(201).json(category);
});

router.patch("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { name, type, icon, color } = req.body;

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(type && { type }),
      ...(icon && { icon }),
      ...(color && { color }),
    },
  });
  res.json(category);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const category = await prisma.category.findUnique({ where: { id } });

  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  if (category.isDefault) {
    res.status(400).json({ error: "Cannot delete default categories" });
    return;
  }

  await prisma.category.delete({ where: { id } });
  res.json({ success: true });
});

export default router;

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import "dotenv/config";

const JWT_SECRET = process.env.JWT_SECRET || "default-secret";
const AUTH_USERNAME = process.env.AUTH_USERNAME || "admin";
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH || "";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

export interface AuthRequest extends Request {
  user?: { username: string };
}

export function jwtAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function webhookAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers["x-webhook-secret"];
  if (!secret || secret !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Invalid webhook secret" });
    return;
  }
  next();
}

export function login(username: string, password: string): string | null {
  if (username !== AUTH_USERNAME) return null;
  if (!bcrypt.compareSync(password, AUTH_PASSWORD_HASH)) return null;
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: "24h" });
}

import { Router, Request, Response } from "express";
import { login, jwtAuth, AuthRequest } from "../middleware/auth";

const router = Router();

router.post("/login", (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const token = login(username, password);
  if (!token) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  res.json({ token });
});

router.get("/me", jwtAuth, (req: AuthRequest, res: Response) => {
  res.json({ username: req.user?.username });
});

export default router;

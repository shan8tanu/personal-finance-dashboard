import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";

import { jwtAuth } from "./middleware/auth";
import authRoutes from "./routes/auth";
import transactionRoutes from "./routes/transactions";
import categoryRoutes from "./routes/categories";
import taggingRuleRoutes from "./routes/taggingRules";
import creditCardRoutes from "./routes/creditCard";
import analyticsRoutes from "./routes/analytics";
import uploadRoutes from "./routes/upload";
import webhookRoutes from "./routes/webhook";

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:5173";

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, same-origin)
    if (!origin || origin === ALLOWED_ORIGIN || process.env.NODE_ENV !== "production") {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));

// Public routes
app.use("/api/auth", authRoutes);
app.use("/api/webhook", webhookRoutes);

// Protected routes
app.use("/api/transactions", jwtAuth, transactionRoutes);
app.use("/api/categories", jwtAuth, categoryRoutes);
app.use("/api/tagging-rules", jwtAuth, taggingRuleRoutes);
app.use("/api/credit-card", jwtAuth, creditCardRoutes);
app.use("/api/analytics", jwtAuth, analyticsRoutes);
app.use("/api/upload", jwtAuth, uploadRoutes);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Serve built React frontend in production
const distPath = path.join(__dirname, "../../client/dist");
if (process.env.NODE_ENV === "production") {
  app.use(express.static(distPath));
  // SPA fallback — must be last, after all API routes
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

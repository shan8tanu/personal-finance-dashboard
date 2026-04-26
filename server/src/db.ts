import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

// Honour DATABASE_URL from .env so dev and production use different files.
// e.g.  dev:  file:./dev.db         → <server>/dev.db
//       prod: file:./prisma/finance.db → <server>/prisma/finance.db
const rawUrl  = process.env.DATABASE_URL ?? "file:./dev.db";
const rawPath = rawUrl.replace(/^file:/, "");
const dbPath  = path.isAbsolute(rawPath)
  ? rawPath
  : path.resolve(__dirname, "..", rawPath);   // __dirname = <server>/src

const adapter = new PrismaBetterSqlite3({ url: "file:" + dbPath });
const prisma  = new PrismaClient({ adapter });

export default prisma;

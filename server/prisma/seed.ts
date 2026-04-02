import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

const dbPath = path.join(__dirname, "..", "dev.db");
const adapter = new PrismaBetterSqlite3({
  url: "file:" + dbPath,
});
const prisma = new PrismaClient({ adapter });

const defaultCategories = [
  // Income
  { name: "Salary", type: "income", icon: "briefcase", color: "#10B981" },
  { name: "Dividends", type: "income", icon: "trending-up", color: "#34D399" },
  { name: "Interest", type: "income", icon: "percent", color: "#6EE7B7" },
  { name: "Misc Income", type: "income", icon: "plus-circle", color: "#A7F3D0" },

  // Investments
  { name: "Investment - SIP", type: "investment", icon: "bar-chart", color: "#3B82F6" },
  { name: "Investment - Mutual Fund", type: "investment", icon: "pie-chart", color: "#60A5FA" },
  { name: "Investment - PPF", type: "investment", icon: "shield", color: "#93C5FD" },
  { name: "Investment - RD", type: "investment", icon: "clock", color: "#BFDBFE" },

  // Expenses
  { name: "Rent", type: "expense", icon: "home", color: "#EF4444" },
  { name: "Groceries", type: "expense", icon: "shopping-cart", color: "#F97316" },
  { name: "Food Delivery", type: "expense", icon: "coffee", color: "#FB923C" },
  { name: "Entertainment", type: "expense", icon: "film", color: "#A855F7" },
  { name: "Shopping", type: "expense", icon: "shopping-bag", color: "#EC4899" },
  { name: "Transport", type: "expense", icon: "map-pin", color: "#F59E0B" },
  { name: "Subscriptions", type: "expense", icon: "repeat", color: "#8B5CF6" },
  { name: "Utilities", type: "expense", icon: "zap", color: "#14B8A6" },
  { name: "Health", type: "expense", icon: "heart", color: "#F43F5E" },
  { name: "ATM Withdrawal", type: "expense", icon: "credit-card", color: "#78716C" },
  { name: "Misc Expense", type: "expense", icon: "more-horizontal", color: "#6B7280" },

  // Transfers
  { name: "Credit Card Payment", type: "transfer", icon: "arrow-right", color: "#9CA3AF" },

  // Fees
  { name: "Fees/Charges", type: "fee", icon: "alert-circle", color: "#DC2626" },
];

async function main() {
  console.log("Seeding default categories...");

  for (const cat of defaultCategories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: { ...cat, isDefault: true },
    });
  }

  console.log(`Seeded ${defaultCategories.length} categories.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

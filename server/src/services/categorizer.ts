import prisma from "../db";

// Keyword-based auto-categorization rules for HDFC transactions
const KEYWORD_RULES: { pattern: RegExp; categoryName: string }[] = [
  // Investments
  { pattern: /GROWW|STOCKSIP|DEBITFORSTOCKSS/i, categoryName: "Investment - SIP" },
  { pattern: /MUTUALFUNDS|INDIANCLEARING/i, categoryName: "Investment - Mutual Fund" },
  { pattern: /NETBANKINGSI-PPF|PPF/i, categoryName: "Investment - PPF" },
  { pattern: /RDINSTALLMENT/i, categoryName: "Investment - RD" },

  // Transfers
  { pattern: /CC\d+.*AUTOPAY|AUTOPAY.*THANK\s*YOU/i, categoryName: "Credit Card Payment" },

  // Income
  { pattern: /INTERESTPAID|INTEREST PAID/i, categoryName: "Interest" },
  { pattern: /TRAVELSTACK/i, categoryName: "Salary" },
  { pattern: /BAINCAP|BAIN COMPANY/i, categoryName: "Salary" },
  { pattern: /URBANCLAP|URBAN COMPANY/i, categoryName: "Salary" },
  { pattern: /ACH\s+C-.*SAL/i, categoryName: "Salary" },
  { pattern: /CDSL|NEFTCR.*CENTRALDEPOSITOR/i, categoryName: "Dividends" },
  { pattern: /ACHC-RAILVIKAS/i, categoryName: "Dividends" },
  { pattern: /ACHD-INDIANCLEARING/i, categoryName: "Investment - Mutual Fund" },

  // Expenses
  { pattern: /NWD-|ATW-/i, categoryName: "ATM Withdrawal" },
  { pattern: /POS\s+\d/i, categoryName: "Misc Expense" },
  { pattern: /RENT|TPT-.*RENT/i, categoryName: "Rent" },
  { pattern: /ZOMATO|SWIGGY|PYU\*ZOMATO/i, categoryName: "Food Delivery" },
  { pattern: /BLINKIT|ZEPTO|BIGBASKET|INSTAMART/i, categoryName: "Groceries" },
  { pattern: /FLIPKART|AMAZON(?!.*PAY.*PRIV.*EMI)/i, categoryName: "Shopping" },
  { pattern: /UBER|OLA|INDIGO.*AIRLINE|RAPIDO/i, categoryName: "Transport" },
  { pattern: /BIGTREE|BOOKMYSHOW/i, categoryName: "Entertainment" },
  { pattern: /CLAUDE\.AI|GOOGLE\s*PLAY|F1\.COM|NETFLIX|SPOTIFY|HOTSTAR/i, categoryName: "Subscriptions" },
  { pattern: /MILLENNIUM.*HEALT|PHARMACY|MEDIC|THEMILLENNIUM/i, categoryName: "Health" },
  { pattern: /KEVENTER|BHAGWATI|RANI\s*KUMARI|JEETENDRA/i, categoryName: "Groceries" },
  { pattern: /NEFTDR-.*SHANTANU|NEFTDR-.*HDFCH/i, categoryName: "Credit Card Payment" },
  { pattern: /UPI-SURABHI/i, categoryName: "Misc Expense" },
  { pattern: /UPI-AMLAN/i, categoryName: "Misc Expense" },
  { pattern: /UPI-MANSI/i, categoryName: "Misc Expense" },
  { pattern: /UPI-RANI/i, categoryName: "Groceries" },

  // CC specific
  { pattern: /IGST-|CGST-|SGST-|FCY\s*MARKUP\s*FEE|CONSOLIDATED\s*FCY/i, categoryName: "Fees/Charges" },
  { pattern: /EMI\s+AMAZON\s*PAY|EMI\s+ANJEER|EMI\s+BIGTREE|EMI\s+WWW\.F1/i, categoryName: "Entertainment" },
];

// Cache category name → id mapping
let categoryCache: Record<string, string> | null = null;

async function getCategoryMap(): Promise<Record<string, string>> {
  if (categoryCache) return categoryCache;
  const categories = await prisma.category.findMany();
  categoryCache = {};
  for (const c of categories) {
    categoryCache[c.name] = c.id;
  }
  return categoryCache;
}

export function invalidateCategoryCache() {
  categoryCache = null;
}

export async function autoCategorize(description: string, counterparty?: string): Promise<{ categoryId: string | null; categoryName: string | null }> {
  const catMap = await getCategoryMap();
  const textToMatch = counterparty ? `${description} ${counterparty}` : description;

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(textToMatch)) {
      const categoryId = catMap[rule.categoryName];
      if (categoryId) {
        return { categoryId, categoryName: rule.categoryName };
      }
    }
  }

  return { categoryId: null, categoryName: null };
}

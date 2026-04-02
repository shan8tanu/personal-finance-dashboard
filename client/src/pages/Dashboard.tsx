import { useState, useEffect } from "react";
import { api } from "../services/api";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function Dashboard() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<any>(null);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [recentTxns, setRecentTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [month, year]);

  async function loadData() {
    setLoading(true);
    try {
      const [summaryRes, categoryRes, trendRes, txnRes] = await Promise.all([
        api.getTransactionSummary(month, year),
        api.getCategoryBreakdown(month, year),
        api.getMonthlyTrend(6),
        api.getTransactions({ page: "1", limit: "10" }),
      ]);
      setSummary(summaryRes);
      setCategoryData(categoryRes.filter((c: any) => c.type === "expense"));
      setTrendData(trendRes);
      setRecentTxns(txnRes.transactions);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }

  const summaryCards = [
    { label: "Income", value: summary?.totalIncome || 0, color: "accent-green", bg: "accent-green-dim" },
    { label: "Expenses", value: summary?.totalExpenses || 0, color: "accent-red", bg: "accent-red-dim" },
    { label: "Investments", value: summary?.totalInvestments || 0, color: "accent-blue", bg: "accent-blue-dim" },
    { label: "Net Savings", value: summary?.netSavings || 0, color: "accent-amber", bg: "accent-amber-dim" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-text-muted text-sm mt-0.5">Financial overview</p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none"
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none"
          >
            {[2024, 2025, 2026].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="bg-surface-secondary border border-border-primary rounded-xl p-5"
          >
            <p className="text-text-muted text-xs font-medium uppercase tracking-wider">{card.label}</p>
            <p className={`text-2xl font-semibold mt-2 tabular-nums text-${card.color}`}>
              {formatCurrency(card.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-5 gap-4">
        {/* Spending by Category - Donut */}
        <div className="col-span-2 bg-surface-secondary border border-border-primary rounded-xl p-5">
          <h2 className="text-sm font-medium text-text-secondary mb-4">Spending by Category</h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  dataKey="total"
                  nameKey="name"
                  paddingAngle={2}
                  stroke="none"
                >
                  {categoryData.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1a1f2e",
                    border: "1px solid #2a3350",
                    borderRadius: "8px",
                    fontSize: "13px",
                    color: "#e8eaf0",
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "12px", color: "#8891a5" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-text-muted text-sm">
              No expense data for this period
            </div>
          )}
        </div>

        {/* Monthly Trend - Bar Chart */}
        <div className="col-span-3 bg-surface-secondary border border-border-primary rounded-xl p-5">
          <h2 className="text-sm font-medium text-text-secondary mb-4">Income vs Expenses Trend</h2>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trendData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2438" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#8891a5", fontSize: 12 }}
                  tickFormatter={(v) => {
                    const [y, m] = v.split("-");
                    return `${MONTHS[parseInt(m) - 1]} ${y.slice(2)}`;
                  }}
                  axisLine={{ stroke: "#1e2438" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#8891a5", fontSize: 12 }}
                  tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1a1f2e",
                    border: "1px solid #2a3350",
                    borderRadius: "8px",
                    fontSize: "13px",
                    color: "#e8eaf0",
                  }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Bar dataKey="income" name="Income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="investments" name="Investments" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", color: "#8891a5" }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-text-muted text-sm">
              No trend data available
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-surface-secondary border border-border-primary rounded-xl">
        <div className="px-5 py-4 border-b border-border-primary">
          <h2 className="text-sm font-medium text-text-secondary">Recent Transactions</h2>
        </div>
        <div className="divide-y divide-border-primary">
          {recentTxns.length > 0 ? (
            recentTxns.map((tx: any) => (
              <div key={tx.id} className="px-5 py-3 flex items-center justify-between hover:bg-surface-hover transition">
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: tx.category?.color || "#6B7280" }}
                  />
                  <div>
                    <p className="text-sm text-text-primary">
                      {tx.counterparty || tx.description?.substring(0, 40)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {tx.category?.name || "Uncategorized"} · {new Date(tx.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </div>
                <span className={`text-sm font-mono font-medium tabular-nums ${tx.type === "credit" ? "text-accent-green" : "text-text-primary"}`}>
                  {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))
          ) : (
            <div className="px-5 py-10 text-center text-text-muted text-sm">
              No transactions yet. Upload a bank statement to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

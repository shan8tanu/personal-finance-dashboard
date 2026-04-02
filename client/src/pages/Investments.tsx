import { useState, useEffect } from "react";
import { api } from "../services/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

const INVESTMENT_CATEGORIES = ["Investment - SIP", "Investment - Mutual Fund", "Investment - PPF", "Investment - RD"];

export default function Investments() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await api.getTransactions({ categoryType: "investment", limit: "200" });
      setTransactions(res.transactions);

      // Build monthly breakdown
      const monthly: Record<string, Record<string, number>> = {};
      for (const tx of res.transactions) {
        const d = new Date(tx.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthly[key]) monthly[key] = {};
        const cat = tx.category?.name || "Other";
        monthly[key][cat] = (monthly[key][cat] || 0) + tx.amount;
      }

      const trend = Object.entries(monthly)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, cats]) => ({ month, ...cats }));
      setTrendData(trend);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Group by category
  const grouped: Record<string, { total: number; count: number; transactions: any[] }> = {};
  for (const tx of transactions) {
    const cat = tx.category?.name || "Other";
    if (!grouped[cat]) grouped[cat] = { total: 0, count: 0, transactions: [] };
    grouped[cat].total += tx.amount;
    grouped[cat].count += 1;
    grouped[cat].transactions.push(tx);
  }

  const totalInvestment = Object.values(grouped).reduce((s, g) => s + g.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
        <p className="text-text-muted text-sm mt-0.5">SIP, Mutual Funds, PPF & RD tracker</p>
      </div>

      {/* Total */}
      <div className="bg-surface-secondary border border-border-primary rounded-xl p-5">
        <p className="text-text-muted text-xs font-medium uppercase tracking-wider">Total Invested</p>
        <p className="text-3xl font-semibold mt-2 tabular-nums text-accent-blue">{formatCurrency(totalInvestment)}</p>
        <p className="text-text-muted text-sm mt-1">{transactions.length} transactions across {Object.keys(grouped).length} categories</p>
      </div>

      {/* Monthly Bar Chart */}
      {trendData.length > 0 && (
        <div className="bg-surface-secondary border border-border-primary rounded-xl p-5">
          <h2 className="text-sm font-medium text-text-secondary mb-4">Monthly Investment Breakdown</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trendData} barCategoryGap="15%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2438" />
              <XAxis dataKey="month" tick={{ fill: "#8891a5", fontSize: 12 }} axisLine={{ stroke: "#1e2438" }} tickLine={false} />
              <YAxis tick={{ fill: "#8891a5", fontSize: 12 }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#1a1f2e", border: "1px solid #2a3350", borderRadius: "8px", fontSize: "13px", color: "#e8eaf0" }} formatter={(value: number) => formatCurrency(value)} />
              <Bar dataKey="Investment - SIP" name="SIP" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
              <Bar dataKey="Investment - Mutual Fund" name="Mutual Fund" fill="#60a5fa" radius={[0, 0, 0, 0]} stackId="a" />
              <Bar dataKey="Investment - PPF" name="PPF" fill="#93c5fd" radius={[0, 0, 0, 0]} stackId="a" />
              <Bar dataKey="Investment - RD" name="RD" fill="#bfdbfe" radius={[4, 4, 0, 0]} stackId="a" />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", color: "#8891a5" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category breakdown */}
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(grouped).sort(([,a], [,b]) => b.total - a.total).map(([cat, data]) => (
          <div key={cat} className="bg-surface-secondary border border-border-primary rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-primary">{cat}</h3>
              <span className="text-sm font-mono font-semibold text-accent-blue tabular-nums">{formatCurrency(data.total)}</span>
            </div>
            <p className="text-xs text-text-muted mb-3">{data.count} transactions</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {data.transactions.slice(0, 10).map((tx: any) => (
                <div key={tx.id} className="flex justify-between text-xs">
                  <span className="text-text-secondary">
                    {new Date(tx.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {tx.counterparty || "—"}
                  </span>
                  <span className="font-mono tabular-nums text-text-primary">{formatCurrency(tx.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {transactions.length === 0 && !loading && (
        <div className="bg-surface-secondary border border-border-primary rounded-xl py-16 text-center text-text-muted text-sm">
          No investment transactions found. Upload a bank statement to get started.
        </div>
      )}
    </div>
  );
}

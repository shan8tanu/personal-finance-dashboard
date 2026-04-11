import { useState, useEffect } from "react";
import { api } from "../services/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const TIP_STYLE = {
  background: "#1e293b", border: "1px solid #334155", borderRadius: "8px",
  fontSize: "13px", color: "#f1f5f9", fontFamily: "Inter, sans-serif",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function Investments() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [trendData, setTrendData]       = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    api.getTransactions({ categoryType: "investment", limit: "200" }).then(res => {
      setTransactions(res.transactions);
      const monthly: Record<string, Record<string, number>> = {};
      for (const tx of res.transactions) {
        const d = new Date(tx.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthly[key]) monthly[key] = {};
        const cat = tx.category?.name || "Other";
        monthly[key][cat] = (monthly[key][cat] || 0) + tx.amount;
      }
      setTrendData(Object.entries(monthly).sort(([a],[b]) => a.localeCompare(b)).map(([m, c]) => ({ month: m, ...c })));
    }).finally(() => setLoading(false));
  }, []);

  const grouped: Record<string, { total: number; count: number; txns: any[] }> = {};
  for (const tx of transactions) {
    const cat = tx.category?.name || "Other";
    if (!grouped[cat]) grouped[cat] = { total: 0, count: 0, txns: [] };
    grouped[cat].total += tx.amount;
    grouped[cat].count++;
    grouped[cat].txns.push(tx);
  }
  const total = Object.values(grouped).reduce((s, g) => s + g.total, 0);

  return (
    <div>
      <div className="mb-8">
        <p className="label mb-1">Portfolio</p>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>Investments</h1>
      </div>

      {/* Total */}
      <div className="card p-6 mb-7">
        <p className="label mb-3">Total Invested</p>
        <p className="text-4xl font-semibold tabular-nums" style={{ color: "var(--color-blue)" }}>{fmt(total)}</p>
        <p className="text-sm mt-2" style={{ color: "var(--color-text-muted)" }}>
          {transactions.length} transactions across {Object.keys(grouped).length} categories
        </p>
      </div>

      {/* Monthly chart */}
      {trendData.length > 0 && (
        <div className="card p-6 mb-7">
          <p className="font-semibold text-base mb-5" style={{ color: "var(--color-text)" }}>Monthly Breakdown</p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={trendData} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="month"
                tick={{ fill: "#64748b", fontSize: 12, fontFamily: "Inter" }}
                tickFormatter={v => { const [y,m] = v.split("-"); return `${MONTHS[parseInt(m)-1]} '${y.slice(2)}`; }}
                axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12, fontFamily: "Inter" }}
                tickFormatter={v => `${(v/1000).toFixed(0)}k`}
                axisLine={false} tickLine={false} width={40} />
              <Tooltip contentStyle={TIP_STYLE} formatter={(v) => fmt(v as number)} />
              <Bar dataKey="Investment - SIP"         name="SIP"         fill="#3b82f6" radius={[4,4,0,0]} stackId="a" />
              <Bar dataKey="Investment - Mutual Fund" name="Mutual Fund" fill="#06b6d4" radius={[0,0,0,0]} stackId="a" />
              <Bar dataKey="Investment - PPF"         name="PPF"         fill="#a855f7" radius={[0,0,0,0]} stackId="a" />
              <Bar dataKey="Investment - RD"          name="RD"          fill="#22c55e" radius={[4,4,0,0]} stackId="a" />
              <Legend iconType="circle" iconSize={8}
                wrapperStyle={{ fontSize: "12px", color: "#94a3b8", paddingTop: "12px" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category cards */}
      {Object.keys(grouped).length > 0 && (
        <div>
          <p className="font-semibold text-base mb-4" style={{ color: "var(--color-text)" }}>By Category</p>
          <div className="grid grid-cols-2 gap-5">
            {Object.entries(grouped).sort(([,a],[,b]) => b.total - a.total).map(([cat, data]) => (
              <div key={cat} className="card p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm" style={{ color: "var(--color-text)" }}>
                    {cat.replace("Investment - ", "")}
                  </p>
                  <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-blue)" }}>
                    {fmt(data.total)}
                  </p>
                </div>
                <p className="text-xs mb-4" style={{ color: "var(--color-text-muted)" }}>
                  {data.count} transactions
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {data.txns.slice(0, 12).map((tx: any) => (
                    <div key={tx.id} className="flex justify-between text-xs">
                      <span style={{ color: "var(--color-text-muted)" }}>
                        {new Date(tx.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                        {tx.counterparty && ` · ${tx.counterparty}`}
                      </span>
                      <span className="tabular-nums" style={{ color: "var(--color-text-sub)" }}>{fmt(tx.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {transactions.length === 0 && !loading && (
        <div className="card py-20 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
          No investment transactions found.
        </div>
      )}
    </div>
  );
}

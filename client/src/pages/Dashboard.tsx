import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

/* ── helpers ─────────────────────────────────────────────── */
const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS = [2022, 2023, 2024, 2025, 2026];

function monthLabel(ym: any) {
  const s = String(ym ?? "");
  const [y, m] = s.split("-");
  return `${MONTH_NAMES[parseInt(m) - 1]} '${y.slice(2)}`;
}

const TIP: React.CSSProperties = {
  background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
  fontSize: 13, color: "#f1f5f9", fontFamily: "Inter, sans-serif",
};

/* ── sub-components ──────────────────────────────────────── */
function Card({ label, value, color, note }: { label: string; value: string; color: string; note?: string }) {
  return (
    <div className="card" style={{ padding: "24px 28px" }}>
      <div className="label" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{value}</div>
      {note && <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>{note}</div>}
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600,
    }}>{text}</span>
  );
}

/* ── main ────────────────────────────────────────────────── */
export default function Dashboard() {
  const now = new Date();
  const navigate = useNavigate();

  // "" means "All Months" / "All Years"
  const [month, setMonth]   = useState<number | "">(now.getMonth() + 1);
  const [year, setYear]     = useState<number | "">(now.getFullYear());

  const [summary, setSummary]           = useState<any>(null);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [trendData, setTrendData]       = useState<any[]>([]);
  const [monthTxns, setMonthTxns]       = useState<any[]>([]);
  const [categories, setCategories]     = useState<any[]>([]);
  const [selectedCat, setSelectedCat]   = useState<string | null>(null);
  const [txnLoading, setTxnLoading]     = useState(false);
  const [trendMonths, setTrendMonths]   = useState(12);

  // Inline editing
  const [editingTx, setEditingTx]   = useState<string | null>(null);
  const [deletingTx, setDeletingTx] = useState<string | null>(null);

  // Fetch categories once for inline editing dropdown
  useEffect(() => { api.getCategories().then(setCategories); }, []);

  /* load summary + category + transactions when month/year changes */
  const loadMonth = useCallback(async (m: number | "", y: number | "") => {
    setTxnLoading(true);
    setSelectedCat(null);

    // Build transaction query params for date range
    const txParams: Record<string, string> = { limit: "500" };
    if (m && y) {
      txParams.startDate = new Date(y as number, (m as number) - 1, 1).toISOString();
      txParams.endDate   = new Date(y as number, m as number, 0, 23, 59, 59).toISOString();
    } else if (y) {
      txParams.startDate = new Date(y as number, 0, 1).toISOString();
      txParams.endDate   = new Date(y as number, 11, 31, 23, 59, 59).toISOString();
    }
    // If neither → no date params → all time

    try {
      const [s, c, txns] = await Promise.all([
        api.getTransactionSummary(m || undefined, y || undefined),
        api.getCategoryBreakdown(m || undefined, y || undefined),
        api.getTransactions(txParams),
      ]);
      setSummary(s);
      setCategoryData(c.filter((x: any) => x.type === "expense" && x.total > 0));
      setMonthTxns(txns.transactions);
    } finally {
      setTxnLoading(false);
    }
  }, []);

  useEffect(() => { loadMonth(month, year); }, [month, year]);

  /* load trend separately */
  useEffect(() => {
    api.getMonthlyTrend(trendMonths).then(setTrendData);
  }, [trendMonths]);

  /* click a bar → jump to that month */
  function onBarClick(data: any) {
    const raw = data?.activeLabel ?? data?.month;
    if (!raw) return;
    const [y, m] = raw.split("-");
    setYear(parseInt(y));
    setMonth(parseInt(m));
  }

  /* inline edit: update category */
  async function updateCategory(txId: string, categoryId: string) {
    await api.updateTransaction(txId, { categoryId });
    setEditingTx(null);
    loadMonth(month, year);
  }

  /* inline edit: toggle type */
  async function toggleType(txId: string, currentType: string) {
    await api.updateTransaction(txId, { type: currentType === "debit" ? "credit" : "debit" });
    loadMonth(month, year);
  }

  /* delete transaction */
  async function deleteTx(txId: string) {
    await api.deleteTransaction(txId);
    setDeletingTx(null);
    loadMonth(month, year);
  }

  /* filter txns by clicked pie category */
  const visibleTxns = selectedCat
    ? monthTxns.filter(tx => tx.category?.name === selectedCat)
    : monthTxns;

  /* uncategorized count */
  const uncategorizedCount = useMemo(
    () => monthTxns.filter(tx => !tx.categoryId).length,
    [monthTxns]
  );

  /* top spenders — ranked by total debit amount per counterparty */
  const topSpenders = useMemo(() => {
    const map: Record<string, number> = {};
    for (const tx of monthTxns) {
      if (tx.type === "debit" && tx.counterparty) {
        map[tx.counterparty] = (map[tx.counterparty] || 0) + tx.amount;
      }
    }
    return Object.entries(map).sort(([,a],[,b]) => b - a).slice(0, 8);
  }, [monthTxns]);

  /* period label */
  const periodLabel = month && year
    ? `${MONTH_NAMES[(month as number) - 1]} ${year}`
    : year
      ? `${year}`
      : "All Time";

  return (
    <div>
      {/* ── Header ─────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Overview</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>Dashboard</h1>
        </div>

        {/* Month/Year pickers */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={String(month)}
            onChange={e => setMonth(e.target.value === "" ? "" : Number(e.target.value))}
            style={selStyle}
          >
            <option value="">All Months</option>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={String(year)}
            onChange={e => setYear(e.target.value === "" ? "" : Number(e.target.value))}
            style={selStyle}
          >
            <option value="">All Years</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── Summary cards ──────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
        <Card label="Income"      value={fmt(summary?.totalIncome      || 0)} color="#22c55e" />
        <Card label="Expenses"    value={fmt(summary?.totalExpenses    || 0)} color="#ef4444" />
        <Card label="Investments" value={fmt(summary?.totalInvestments || 0)} color="#3b82f6" />
        <Card label="Net Savings" value={fmt(summary?.netSavings       || 0)} color="#f59e0b"
          note={summary?.netSavings < 0 ? "Spending more than earning" : undefined} />
      </div>

      {/* ── Charts ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 3fr", gap: 20, marginBottom: 24 }}>

        {/* Pie — click to filter */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600 }}>Spending by Category</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{periodLabel}</div>
          </div>
          {selectedCat && (
            <div style={{ marginBottom: 8 }}>
              <button onClick={() => setSelectedCat(null)} style={{
                background: "#3b82f620", border: "1px solid #3b82f640", color: "#3b82f6",
                borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer"
              }}>
                ✕ Clear filter: {selectedCat}
              </button>
            </div>
          )}
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="45%"
                  innerRadius={60} outerRadius={105}
                  dataKey="total" nameKey="name" paddingAngle={3} stroke="none"
                  onClick={(data: any) => setSelectedCat(prev => prev === data.name ? null : data.name)}
                  style={{ cursor: "pointer" }}>
                  {categoryData.map((e: any, i: number) => (
                    <Cell key={i} fill={e.color}
                      opacity={selectedCat && selectedCat !== e.name ? 0.35 : 1} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TIP} formatter={(v) => fmt(v as number)} />
                <Legend verticalAlign="bottom" iconType="circle" iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 14 }}>
              No expense data for {periodLabel}
            </div>
          )}
          {categoryData.length > 0 && (
            <p style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 4 }}>
              Click a slice to filter transactions below
            </p>
          )}
        </div>

        {/* Bar — click month to navigate */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600 }}>Monthly Trend</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[6, 12, 24].map(n => (
                <button key={n} onClick={() => setTrendMonths(n)} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 12, border: "none", cursor: "pointer",
                  background: trendMonths === n ? "#3b82f6" : "#263244",
                  color: trendMonths === n ? "#fff" : "#94a3b8"
                }}>{n}M</button>
              ))}
            </div>
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trendData} barCategoryGap="30%" barGap={3}
                onClick={onBarClick} style={{ cursor: "pointer" }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="month"
                  tick={{ fill: "#64748b", fontSize: 11, fontFamily: "Inter" }}
                  tickFormatter={monthLabel}
                  axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11, fontFamily: "Inter" }}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                  axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={TIP} labelFormatter={monthLabel}
                  formatter={(v) => fmt(v as number)} cursor={{ fill: "#334155", opacity: 0.5 }} />
                <Bar dataKey="income"      name="Income"      fill="#22c55e" radius={[3,3,0,0]} />
                <Bar dataKey="expenses"    name="Expenses"    fill="#ef4444" radius={[3,3,0,0]} />
                <Bar dataKey="investments" name="Investments" fill="#3b82f6" radius={[3,3,0,0]} />
                <Legend iconType="circle" iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: 14 }}>
              No data
            </div>
          )}
          <p style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 4 }}>
            Click any bar to view that month's transactions below
          </p>
        </div>
      </div>

      {/* ── Top Spenders + Uncategorized ─────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

        {/* Top Spenders */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
            Top Spenders
            <span style={{ color: "#64748b", fontWeight: 400, fontSize: 12, marginLeft: 8 }}>{periodLabel}</span>
          </div>
          {topSpenders.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
              No debit transactions
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {topSpenders.map(([name, total], i) => {
                const maxVal = topSpenders[0][1] as number;
                const pct = (total as number) / maxVal * 100;
                return (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: i < topSpenders.length - 1 ? "1px solid #1e293b" : "none" }}>
                    <span style={{ width: 20, textAlign: "right", fontSize: 12, fontWeight: 600, color: "#475569" }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#f1f5f9", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </span>
                        <span style={{ color: "#94a3b8", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", flexShrink: 0, marginLeft: 12 }}>
                          {fmt(total as number)}
                        </span>
                      </div>
                      <div style={{ height: 3, borderRadius: 2, background: "#1e293b" }}>
                        <div style={{ height: "100%", borderRadius: 2, background: "#ef4444", width: `${pct}%`, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Stats */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Quick Stats</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Total Transactions</span>
              <span style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600 }}>{monthTxns.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Debit Transactions</span>
              <span style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600 }}>
                {monthTxns.filter(tx => tx.type === "debit").length}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Credit Transactions</span>
              <span style={{ color: "#22c55e", fontSize: 14, fontWeight: 600 }}>
                {monthTxns.filter(tx => tx.type === "credit").length}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Avg Transaction</span>
              <span style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600 }}>
                {monthTxns.length > 0 ? fmt(monthTxns.reduce((s, tx) => s + tx.amount, 0) / monthTxns.length) : "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#94a3b8", fontSize: 13 }}>Largest Expense</span>
              <span style={{ color: "#ef4444", fontSize: 14, fontWeight: 600 }}>
                {monthTxns.filter(tx => tx.type === "debit").length > 0
                  ? fmt(Math.max(...monthTxns.filter(tx => tx.type === "debit").map(tx => tx.amount)))
                  : "—"}
              </span>
            </div>

            {/* Uncategorized badge — clickable, deep-links to Transactions page */}
            {uncategorizedCount > 0 && (
              <div
                onClick={() => navigate("/transactions?filter=uncategorized")}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 8,
                  padding: "10px 14px", marginTop: 4, cursor: "pointer",
                }}
              >
                <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 500 }}>
                  ⚠ Uncategorized
                </span>
                <span style={{ color: "#f59e0b", fontSize: 14, fontWeight: 700 }}>
                  {uncategorizedCount}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Transactions for selected period ────── */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid #334155",
          display: "flex", alignItems: "center", justifyContent: "space-between"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#f1f5f9", fontSize: 15, fontWeight: 600 }}>
              Transactions — {periodLabel}
            </span>
            {selectedCat && (
              <Badge text={selectedCat} color="#3b82f6" />
            )}
            {uncategorizedCount > 0 && !selectedCat && (
              <span style={{
                background: "#f59e0b22", color: "#f59e0b", borderRadius: 12,
                padding: "2px 10px", fontSize: 11, fontWeight: 600,
              }}>
                {uncategorizedCount} uncategorized
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {visibleTxns.length > 0 && (
              <span style={{ fontSize: 12, color: "#64748b" }}>
                {visibleTxns.length} transactions
                {selectedCat ? ` in ${selectedCat}` : ""}
              </span>
            )}
            {selectedCat && (
              <button onClick={() => setSelectedCat(null)} style={{
                background: "transparent", border: "none", color: "#64748b",
                fontSize: 12, cursor: "pointer"
              }}>✕ Clear filter</button>
            )}
          </div>
        </div>

        {txnLoading ? (
          <div style={{ padding: 48, textAlign: "center", color: "#64748b", fontSize: 14 }}>Loading...</div>
        ) : visibleTxns.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "#64748b", fontSize: 14 }}>
            No transactions for {periodLabel}{selectedCat ? ` in ${selectedCat}` : ""}.
          </div>
        ) : (
          <div style={{ overflowY: "auto", maxHeight: 520 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#1a2a3e", zIndex: 1 }}>
                <tr style={{ borderBottom: "1px solid #334155" }}>
                  <th style={th}>Date</th>
                  <th style={th}>Description</th>
                  <th style={th}>Category</th>
                  <th style={{ ...th, textAlign: "center" }}>Type</th>
                  <th style={{ ...th, textAlign: "right" }}>Amount</th>
                  <th style={{ ...th, width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {visibleTxns.map(tx => (
                  <tr key={tx.id} style={{ borderBottom: "1px solid #1e293b" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#263244")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>

                    {/* Date */}
                    <td style={td}>
                      <span style={{ color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>
                        {new Date(tx.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    </td>

                    {/* Description */}
                    <td style={{ ...td, maxWidth: 320 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                          background: tx.category?.color || "#475569"
                        }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {tx.counterparty || "—"}
                          </div>
                          {tx.description && tx.counterparty && (
                            <div style={{ color: "#64748b", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {tx.description.substring(0, 80)}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category — inline editable */}
                    <td style={td}>
                      {editingTx === tx.id ? (
                        <select
                          value={tx.categoryId || ""}
                          onChange={e => updateCategory(tx.id, e.target.value)}
                          onBlur={() => setEditingTx(null)}
                          autoFocus
                          style={{ ...catSelStyle, minWidth: 140 }}
                        >
                          <option value="">Uncategorized</option>
                          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingTx(tx.id)}
                          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                        >
                          <span style={{ color: tx.category ? "#94a3b8" : "#f59e0b", fontSize: 13 }}>
                            {tx.category?.name || "Uncategorized"}
                          </span>
                          <span style={{ color: "#475569", fontSize: 10 }}>✎</span>
                        </button>
                      )}
                    </td>

                    {/* Type — clickable toggle */}
                    <td style={{ ...td, textAlign: "center" }}>
                      <button
                        onClick={() => toggleType(tx.id, tx.type)}
                        title={`Click to change to ${tx.type === "debit" ? "Credit" : "Debit"}`}
                        style={{
                          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                          border: "none", cursor: "pointer",
                          background: tx.type === "credit" ? "#22c55e22" : "#94a3b811",
                          color: tx.type === "credit" ? "#22c55e" : "#94a3b8",
                        }}
                      >
                        {tx.type === "credit" ? "Credit" : "Debit"}
                      </button>
                    </td>

                    {/* Amount */}
                    <td style={{ ...td, textAlign: "right" }}>
                      <span style={{
                        fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                        color: tx.type === "credit" ? "#22c55e" : "#f1f5f9"
                      }}>
                        {tx.type === "credit" ? "+" : "−"}{fmt(tx.amount)}
                      </span>
                    </td>

                    {/* Delete */}
                    <td style={{ ...td, textAlign: "center" }}>
                      {deletingTx === tx.id ? (
                        <button
                          onClick={() => deleteTx(tx.id)}
                          style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", background: "none", border: "1px solid #ef444440", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}
                        >
                          Confirm
                        </button>
                      ) : (
                        <button
                          onClick={() => setDeletingTx(tx.id)}
                          title="Delete transaction"
                          style={{ fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "#475569", padding: "2px 6px" }}
                          onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                          onMouseLeave={e => (e.currentTarget.style.color = "#475569")}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── styles ─────────────────────────────────── */
const selStyle: React.CSSProperties = {
  background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
  color: "#94a3b8", padding: "8px 12px", fontSize: 14, outline: "none", cursor: "pointer",
  fontFamily: "inherit",
};

const catSelStyle: React.CSSProperties = {
  background: "#1e293b", border: "1px solid #334155", borderRadius: 6,
  color: "#94a3b8", padding: "5px 8px", fontSize: 13, outline: "none", cursor: "pointer",
  fontFamily: "inherit",
};

const th: React.CSSProperties = {
  padding: "12px 20px", textAlign: "left",
  fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b"
};

const td: React.CSSProperties = {
  padding: "10px 20px", verticalAlign: "middle"
};

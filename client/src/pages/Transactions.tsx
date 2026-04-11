import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../services/api";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEARS = [2022, 2023, 2024, 2025, 2026];

export default function Transactions() {
  const now = new Date();
  const [searchParams] = useSearchParams();

  const [transactions, setTransactions] = useState<any[]>([]);
  const [pagination, setPagination]     = useState<any>({});
  const [categories, setCategories]     = useState<any[]>([]);

  // Filters
  const [search, setSearch]             = useState("");
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get("filter") === "uncategorized" ? "uncategorized" : "");
  const [typeFilter, setTypeFilter]     = useState("");
  const [monthFilter, setMonthFilter]   = useState<number | "">(now.getMonth() + 1);
  const [yearFilter, setYearFilter]     = useState<number | "">(now.getFullYear());
  const [minAmount, setMinAmount]       = useState("");
  const [maxAmount, setMaxAmount]       = useState("");
  const [page, setPage]                 = useState(1);
  const [loading, setLoading]           = useState(true);

  // Sort
  const [sortBy, setSortBy]   = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Inline editing
  const [editingTx, setEditingTx]   = useState<string | null>(null);
  const [deletingTx, setDeletingTx] = useState<string | null>(null);

  useEffect(() => { api.getCategories().then(setCategories); }, []);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, categoryFilter, typeFilter, monthFilter, yearFilter, minAmount, maxAmount, sortBy, sortDir]);

  useEffect(() => { load(); }, [page, search, categoryFilter, typeFilter, monthFilter, yearFilter, minAmount, maxAmount, sortBy, sortDir]);

  async function load() {
    setLoading(true);
    try {
      const p: Record<string, string> = { page: String(page), limit: "50", sortBy, sortDir };
      if (search)         p.search     = search;
      if (categoryFilter) p.categoryId = categoryFilter;
      if (typeFilter)     p.type       = typeFilter;
      if (minAmount)      p.minAmount  = minAmount;
      if (maxAmount)      p.maxAmount  = maxAmount;

      // Date range
      if (monthFilter && yearFilter) {
        p.startDate = new Date(yearFilter as number, (monthFilter as number) - 1, 1).toISOString();
        p.endDate   = new Date(yearFilter as number, monthFilter as number, 0, 23, 59, 59).toISOString();
      } else if (yearFilter) {
        p.startDate = new Date(yearFilter as number, 0, 1).toISOString();
        p.endDate   = new Date(yearFilter as number, 11, 31, 23, 59, 59).toISOString();
      }

      const res = await api.getTransactions(p);
      setTransactions(res.transactions);
      setPagination(res.pagination);
    } finally { setLoading(false); }
  }

  async function updateCategory(txId: string, categoryId: string) {
    await api.updateTransaction(txId, { categoryId });
    setEditingTx(null);
    load();
  }

  async function toggleType(txId: string, currentType: string) {
    await api.updateTransaction(txId, { type: currentType === "debit" ? "credit" : "debit" });
    load();
  }

  async function deleteTx(txId: string) {
    await api.deleteTransaction(txId);
    setDeletingTx(null);
    load();
  }

  function handleSort(field: string) {
    if (sortBy === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir(field === "amount" ? "desc" : "asc");
    }
  }

  function clearFilters() {
    setSearch(""); setCategoryFilter(""); setTypeFilter("");
    setMonthFilter(""); setYearFilter(""); setMinAmount(""); setMaxAmount("");
    setSortBy("date"); setSortDir("desc");
  }

  const hasFilters = search || categoryFilter || typeFilter || minAmount || maxAmount || !monthFilter || !yearFilter;

  function SortHeader({ field, label, align }: { field: string; label: string; align?: string }) {
    const active = sortBy === field;
    return (
      <th
        onClick={() => handleSort(field)}
        style={{ ...thStyle, textAlign: (align || "left") as any, cursor: "pointer", userSelect: "none" }}
      >
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
      </th>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div className="label" style={{ marginBottom: 4 }}>Bank Account</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>
            Transactions
            {pagination.total != null && (
              <span style={{ fontSize: 15, fontWeight: 400, color: "#64748b", marginLeft: 12 }}>
                {pagination.total} records
              </span>
            )}
          </h1>
          {hasFilters && (
            <button onClick={clearFilters} style={ghostBtn}>Clear all filters</button>
          )}
        </div>
      </div>

      {/* Filter row 1: date */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={String(monthFilter)} onChange={e => setMonthFilter(e.target.value === "" ? "" : Number(e.target.value))} style={selStyle}>
          <option value="">All Months</option>
          {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select value={String(yearFilter)} onChange={e => setYearFilter(e.target.value === "" ? "" : Number(e.target.value))} style={selStyle}>
          <option value="">All Years</option>
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Quick month jumps */}
        <div style={{ borderLeft: "1px solid #334155", paddingLeft: 8, marginLeft: 4, display: "flex", gap: 4 }}>
          {[-2, -1, 0].map(offset => {
            const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
            const m = d.getMonth() + 1, y = d.getFullYear();
            const active = monthFilter === m && yearFilter === y;
            return (
              <button key={offset} onClick={() => { setMonthFilter(m); setYearFilter(y); }}
                style={{
                  padding: "7px 12px", borderRadius: 6, fontSize: 13, border: "none", cursor: "pointer",
                  background: active ? "#3b82f6" : "#1e293b", color: active ? "#fff" : "#94a3b8",
                }}>
                {MONTH_NAMES[m - 1]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter row 2: search + category + type + amount */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <input type="text" placeholder="Search counterparty or description…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={selStyle}>
          <option value="">All Categories</option>
          <option value="uncategorized">⚠ Uncategorized</option>
          {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selStyle}>
          <option value="">All Types</option>
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
        </select>
        <input type="number" placeholder="Min ₹" value={minAmount}
          onChange={e => setMinAmount(e.target.value)}
          style={{ ...inputStyle, width: 100 }} />
        <input type="number" placeholder="Max ₹" value={maxAmount}
          onChange={e => setMaxAmount(e.target.value)}
          style={{ ...inputStyle, width: 100 }} />
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #334155", background: "#1a2a3e" }}>
              <SortHeader field="date" label="Date" />
              <th style={thStyle}>Description</th>
              <th style={thStyle}>Category</th>
              <SortHeader field="type" label="Type" align="center" />
              <SortHeader field="amount" label="Amount" align="right" />
              <th style={{ ...thStyle, width: 70 }} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={emptyTd}>Loading…</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={6} style={emptyTd}>No transactions found.</td></tr>
            ) : transactions.map(tx => (
              <tr key={tx.id} style={{ borderBottom: "1px solid #1e293b" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#263244")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>

                {/* Date */}
                <td style={tdStyle}>
                  <span style={{ color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>
                    {new Date(tx.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                </td>

                {/* Description */}
                <td style={{ ...tdStyle, maxWidth: 340 }}>
                  <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {tx.counterparty || "—"}
                  </div>
                  {tx.description && (
                    <div style={{ color: "#64748b", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                      {tx.description.substring(0, 80)}
                    </div>
                  )}
                </td>

                {/* Category — inline editable */}
                <td style={tdStyle}>
                  {editingTx === tx.id ? (
                    <select value={tx.categoryId || ""}
                      onChange={e => updateCategory(tx.id, e.target.value)}
                      onBlur={() => setEditingTx(null)} autoFocus
                      style={{ ...selStyle, minWidth: 150, padding: "5px 8px" }}>
                      <option value="">Uncategorized</option>
                      {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : (
                    <button onClick={() => setEditingTx(tx.id)}
                      style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: tx.category?.color || "#475569", flexShrink: 0 }} />
                      <span style={{ color: tx.category ? "#94a3b8" : "#f59e0b", fontSize: 13 }}>
                        {tx.category?.name || "Uncategorized"}
                      </span>
                    </button>
                  )}
                </td>

                {/* Type — clickable toggle */}
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  <button
                    onClick={() => toggleType(tx.id, tx.type)}
                    title={`Click to change to ${tx.type === "debit" ? "Credit" : "Debit"}`}
                    style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, border: "none", cursor: "pointer",
                      background: tx.type === "credit" ? "#22c55e22" : "#94a3b811",
                      color: tx.type === "credit" ? "#22c55e" : "#94a3b8",
                    }}>
                    {tx.type === "credit" ? "Credit" : "Debit"}
                  </button>
                </td>

                {/* Amount */}
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <span style={{
                    fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                    color: tx.type === "credit" ? "#22c55e" : "#f1f5f9"
                  }}>
                    {tx.type === "credit" ? "+" : "−"}{fmt(tx.amount)}
                  </span>
                </td>

                {/* Actions — delete */}
                <td style={{ ...tdStyle, textAlign: "center" }}>
                  {deletingTx === tx.id ? (
                    <button onClick={() => deleteTx(tx.id)}
                      style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", background: "none", border: "1px solid #ef444440", borderRadius: 4, padding: "2px 8px", cursor: "pointer" }}>
                      Confirm
                    </button>
                  ) : (
                    <button
                      onClick={() => setDeletingTx(tx.id)}
                      title="Delete transaction"
                      style={{ fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "#475569", padding: "2px 6px" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                      onMouseLeave={e => (e.currentTarget.style.color = "#475569")}>
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{
            padding: "14px 20px", borderTop: "1px solid #334155",
            display: "flex", alignItems: "center", justifyContent: "space-between"
          }}>
            <span style={{ color: "#64748b", fontSize: 13 }}>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={paginBtn(page > 1)}>← Prev</button>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages} style={paginBtn(page < pagination.totalPages)}>Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── styles ──────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
  color: "#f1f5f9", padding: "9px 14px", fontSize: 14, outline: "none",
  fontFamily: "inherit",
};
const selStyle: React.CSSProperties = {
  background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
  color: "#94a3b8", padding: "9px 12px", fontSize: 14, outline: "none", cursor: "pointer",
  fontFamily: "inherit",
};
const ghostBtn: React.CSSProperties = {
  background: "transparent", border: "1px solid #334155", borderRadius: 8,
  color: "#94a3b8", padding: "7px 14px", fontSize: 13, cursor: "pointer",
  fontFamily: "inherit",
};
const thStyle: React.CSSProperties = {
  padding: "12px 16px", textAlign: "left",
  fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b"
};
const tdStyle: React.CSSProperties = { padding: "10px 16px", verticalAlign: "middle" };
const emptyTd: React.CSSProperties = { padding: 48, textAlign: "center", color: "#64748b", fontSize: 14 };
const paginBtn = (enabled: boolean): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 8, background: "#263244", border: "none",
  color: enabled ? "#94a3b8" : "#475569", fontSize: 13, cursor: enabled ? "pointer" : "not-allowed",
  opacity: enabled ? 1 : 0.4, fontFamily: "inherit",
});

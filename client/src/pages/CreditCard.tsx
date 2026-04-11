import { useState, useEffect } from "react";
import { api } from "../services/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { UploadModal } from "../components/Layout";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const TIP: React.CSSProperties = {
  background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
  fontSize: 13, color: "#f1f5f9", fontFamily: "Inter, sans-serif",
};

export default function CreditCard() {
  const [statements, setStatements]   = useState<any[]>([]);
  const [selectedStmt, setSelectedStmt] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary]         = useState<any>(null);
  const [loading, setLoading]         = useState(true);
  const [showUpload, setShowUpload]   = useState(false);

  function loadData() {
    setLoading(true);
    return Promise.all([api.getCreditCardStatements(), api.getCreditCardSummary()])
      .then(([stmts, sum]) => { setStatements(stmts); setSummary(sum); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(); }, []);

  async function toggleStatement(id: string) {
    if (selectedStmt === id) { setSelectedStmt(null); setTransactions([]); return; }
    setSelectedStmt(id);
    const txns = await api.getCreditCardTransactions(id);
    setTransactions(txns);
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>HDFC Regalia Gold</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#f1f5f9" }}>Credit Card</h1>
        </div>
        <button onClick={() => setShowUpload(true)} style={{
          background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
          padding: "9px 18px", fontSize: 14, fontWeight: 500, cursor: "pointer"
        }}>
          + Upload Statement
        </button>
      </div>

      {/* Summary strip */}
      {summary?.byCategory?.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20, marginBottom: 24 }}>
          <div className="card" style={{ padding: "24px 28px" }}>
            <div className="label" style={{ marginBottom: 10 }}>Total Spend (All Time)</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: "#a855f7", fontVariantNumeric: "tabular-nums" }}>
              {fmt(summary.totalSpend)}
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 8 }}>
              {statements.length} statement{statements.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div className="card" style={{ padding: 24 }}>
            <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Spend by Category</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={summary.byCategory} cx="50%" cy="45%"
                  innerRadius={50} outerRadius={85}
                  dataKey="total" nameKey="name" paddingAngle={3} stroke="none">
                  {summary.byCategory.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={TIP} formatter={(v) => fmt(v as number)} />
                <Legend iconType="circle" iconSize={8}
                  wrapperStyle={{ fontSize: 12, color: "#94a3b8", paddingTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Statements list */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: "#f1f5f9", fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
          Statements
          <span style={{ color: "#64748b", fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
            — click to expand transactions
          </span>
        </div>

        {statements.length === 0 && !loading && (
          <div className="card" style={{ padding: 48, textAlign: "center" }}>
            <div style={{ color: "#64748b", fontSize: 15, marginBottom: 16 }}>No credit card statements uploaded yet.</div>
            <button onClick={() => setShowUpload(true)} style={{
              background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8,
              padding: "10px 20px", fontSize: 14, fontWeight: 500, cursor: "pointer"
            }}>
              Upload First Statement
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {statements.map(stmt => (
            <div key={stmt.id} className="card" style={{ overflow: "hidden" }}>
              {/* Statement header row */}
              <div
                onClick={() => toggleStatement(stmt.id)}
                style={{
                  padding: "16px 24px", display: "flex", alignItems: "center",
                  justifyContent: "space-between", cursor: "pointer"
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#263244")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>

                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, background: "#a855f722",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0
                  }}>💳</div>
                  <div>
                    <div style={{ color: "#f1f5f9", fontSize: 14, fontWeight: 600 }}>
                      {new Date(stmt.billingPeriodStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {" – "}
                      {new Date(stmt.billingPeriodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                      Due {new Date(stmt.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {stmt.rewardPoints > 0 && ` · ${stmt.rewardPoints} reward pts`}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#a855f7", fontVariantNumeric: "tabular-nums" }}>
                      {fmt(stmt.totalDue)}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                      Min: {fmt(stmt.minimumDue)}
                    </div>
                  </div>
                  <div style={{ color: "#64748b", fontSize: 18 }}>
                    {selectedStmt === stmt.id ? "▲" : "▼"}
                  </div>
                </div>
              </div>

              {/* Expanded transactions */}
              {selectedStmt === stmt.id && (
                <div style={{ borderTop: "1px solid #334155" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#1a2a3e", borderBottom: "1px solid #334155" }}>
                        <th style={th}>Date</th>
                        <th style={th}>Merchant</th>
                        <th style={th}>Category</th>
                        <th style={{ ...th, textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(tx => (
                        <tr key={tx.id} style={{ borderBottom: "1px solid #1e293b" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#263244")}
                          onMouseLeave={e => (e.currentTarget.style.background = "")}>
                          <td style={{ ...td, color: "#64748b", fontSize: 13, whiteSpace: "nowrap" }}>
                            {new Date(tx.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </td>
                          <td style={td}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ color: "#f1f5f9", fontSize: 14 }}>{tx.counterparty || "—"}</span>
                              {tx.isInternational && (
                                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: "#06b6d422", color: "#06b6d4" }}>INTL</span>
                              )}
                              {tx.description?.toUpperCase().includes("EMI") && (
                                <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: "#f59e0b22", color: "#f59e0b" }}>EMI</span>
                              )}
                            </div>
                          </td>
                          <td style={td}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: tx.category?.color || "#475569" }} />
                              <span style={{ color: "#94a3b8", fontSize: 13 }}>{tx.category?.name || "—"}</span>
                            </div>
                          </td>
                          <td style={{ ...td, textAlign: "right" }}>
                            <span style={{
                              fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums",
                              color: tx.type === "credit" ? "#22c55e" : "#f1f5f9"
                            }}>
                              {tx.type === "credit" ? "+" : "−"}{fmt(tx.amount)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showUpload && <UploadModal onClose={() => { setShowUpload(false); loadData(); }} />}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "10px 20px", textAlign: "left",
  fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b"
};
const td: React.CSSProperties = { padding: "11px 20px", verticalAlign: "middle" };

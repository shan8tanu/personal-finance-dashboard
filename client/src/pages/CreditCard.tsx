import { useState, useEffect } from "react";
import { api } from "../services/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default function CreditCard() {
  const [statements, setStatements] = useState<any[]>([]);
  const [selectedStmt, setSelectedStmt] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [stmts, sum] = await Promise.all([
        api.getCreditCardStatements(),
        api.getCreditCardSummary(),
      ]);
      setStatements(stmts);
      setSummary(sum);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadStatementTxns(stmtId: string) {
    if (selectedStmt === stmtId) {
      setSelectedStmt(null);
      setTransactions([]);
      return;
    }
    setSelectedStmt(stmtId);
    const txns = await api.getCreditCardTransactions(stmtId);
    setTransactions(txns);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Credit Card</h1>
        <p className="text-text-muted text-sm mt-0.5">HDFC Regalia Gold spending breakdown</p>
      </div>

      {/* Spending Summary */}
      {summary && summary.byCategory?.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-surface-secondary border border-border-primary rounded-xl p-5">
            <p className="text-text-muted text-xs font-medium uppercase tracking-wider">Total CC Spend</p>
            <p className="text-2xl font-semibold mt-2 tabular-nums text-accent-purple">
              {formatCurrency(summary.totalSpend)}
            </p>
          </div>
          <div className="col-span-2 bg-surface-secondary border border-border-primary rounded-xl p-5">
            <h2 className="text-sm font-medium text-text-secondary mb-3">Spending by Category</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={summary.byCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  dataKey="total"
                  nameKey="name"
                  paddingAngle={2}
                  stroke="none"
                >
                  {summary.byCategory.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#1a1f2e", border: "1px solid #2a3350", borderRadius: "8px", fontSize: "13px", color: "#e8eaf0" }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", color: "#8891a5" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Statements */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-text-secondary">Statements</h2>
        {statements.length === 0 && !loading && (
          <div className="bg-surface-secondary border border-border-primary rounded-xl py-16 text-center text-text-muted text-sm">
            No credit card statements uploaded yet
          </div>
        )}
        {statements.map((stmt) => (
          <div key={stmt.id} className="bg-surface-secondary border border-border-primary rounded-xl overflow-hidden">
            <button
              onClick={() => loadStatementTxns(stmt.id)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-surface-hover transition text-left"
            >
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {new Date(stmt.billingPeriodStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — {new Date(stmt.billingPeriodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  Due: {new Date(stmt.dueDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · Points: {stmt.rewardPoints}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-mono font-semibold text-accent-purple tabular-nums">
                  {formatCurrency(stmt.totalDue)}
                </p>
                <p className="text-xs text-text-muted">Min: {formatCurrency(stmt.minimumDue)}</p>
              </div>
            </button>

            {selectedStmt === stmt.id && (
              <div className="border-t border-border-primary">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-primary">
                      <th className="text-left px-4 py-2 text-text-muted text-xs font-medium">Date</th>
                      <th className="text-left px-4 py-2 text-text-muted text-xs font-medium">Merchant</th>
                      <th className="text-left px-4 py-2 text-text-muted text-xs font-medium">Category</th>
                      <th className="text-center px-4 py-2 text-text-muted text-xs font-medium">Intl</th>
                      <th className="text-right px-4 py-2 text-text-muted text-xs font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-primary">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-surface-hover transition">
                        <td className="px-4 py-2.5 text-text-secondary text-xs font-mono whitespace-nowrap">
                          {new Date(tx.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-text-primary text-sm">{tx.counterparty || "—"}</span>
                          {tx.description?.includes("EMI") && (
                            <span className="ml-2 text-[10px] bg-accent-amber-dim text-accent-amber px-1.5 py-0.5 rounded">EMI</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: tx.category?.color || "#6B7280" }} />
                            {tx.category?.name || "Uncategorized"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {tx.isInternational && <span className="text-[10px] bg-accent-blue-dim text-accent-blue px-1.5 py-0.5 rounded">INTL</span>}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono tabular-nums text-sm font-medium ${tx.type === "credit" ? "text-accent-green" : "text-text-primary"}`}>
                          {tx.type === "credit" ? "+" : ""}{formatCurrency(tx.amount)}
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
  );
}

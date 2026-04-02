import { useState, useEffect } from "react";
import { api } from "../services/api";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function Transactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({});
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [editingTx, setEditingTx] = useState<string | null>(null);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(console.error);
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [page, search, categoryFilter, typeFilter]);

  async function loadTransactions() {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: "25" };
      if (search) params.search = search;
      if (categoryFilter) params.categoryId = categoryFilter;
      if (typeFilter) params.type = typeFilter;

      const res = await api.getTransactions(params);
      setTransactions(res.transactions);
      setPagination(res.pagination);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function updateCategory(txId: string, categoryId: string) {
    await api.updateTransaction(txId, { categoryId });
    setEditingTx(null);
    loadTransactions();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bank Transactions</h1>
          <p className="text-text-muted text-sm mt-0.5">{pagination.total || 0} transactions</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="bg-accent-blue hover:bg-accent-blue/90 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
        >
          Upload Statement
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search transactions..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 bg-surface-secondary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue transition"
        />
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          className="bg-surface-secondary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none"
        >
          <option value="">All Categories</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-surface-secondary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none"
        >
          <option value="">All Types</option>
          <option value="debit">Debit</option>
          <option value="credit">Credit</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface-secondary border border-border-primary rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-left px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Date</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Description</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Category</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Amount</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-surface-hover transition">
                <td className="px-4 py-3 text-text-secondary whitespace-nowrap font-mono text-xs">
                  {new Date(tx.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                </td>
                <td className="px-4 py-3">
                  <div className="text-text-primary">{tx.counterparty || "—"}</div>
                  <div className="text-text-muted text-xs truncate max-w-xs">{tx.description}</div>
                </td>
                <td className="px-4 py-3">
                  {editingTx === tx.id ? (
                    <select
                      value={tx.categoryId || ""}
                      onChange={(e) => updateCategory(tx.id, e.target.value)}
                      onBlur={() => setEditingTx(null)}
                      autoFocus
                      className="bg-surface-tertiary border border-border-accent rounded px-2 py-1 text-xs text-text-primary focus:outline-none"
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  ) : (
                    <button
                      onClick={() => setEditingTx(tx.id)}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-surface-tertiary transition"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: tx.category?.color || "#6B7280" }}
                      />
                      {tx.category?.name || "Uncategorized"}
                    </button>
                  )}
                </td>
                <td className={`px-4 py-3 text-right font-mono tabular-nums font-medium ${tx.type === "credit" ? "text-accent-green" : "text-text-primary"}`}>
                  {tx.type === "credit" ? "+" : "-"}{formatCurrency(tx.amount)}
                </td>
                <td className="px-4 py-3 text-right font-mono tabular-nums text-text-muted text-xs">
                  {tx.closingBalance ? formatCurrency(tx.closingBalance) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {transactions.length === 0 && (
          <div className="py-16 text-center text-text-muted text-sm">
            {loading ? "Loading..." : "No transactions found"}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border-primary flex items-center justify-between">
            <span className="text-xs text-text-muted">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-xs bg-surface-tertiary rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-40 transition"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                disabled={page >= pagination.totalPages}
                className="px-3 py-1.5 text-xs bg-surface-tertiary rounded-lg text-text-secondary hover:text-text-primary disabled:opacity-40 transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSuccess={() => { setShowUpload(false); loadTransactions(); }} />}
    </div>
  );
}

function UploadModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [type, setType] = useState<"bank" | "cc">("bank");

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const res = type === "bank"
        ? await api.uploadBankStatement(file, password || undefined)
        : await api.uploadCreditCardStatement(file);
      setResult(res);
      setTimeout(onSuccess, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-secondary border border-border-primary rounded-xl p-6 w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Upload Statement</h2>

        <div className="flex gap-2">
          <button
            onClick={() => setType("bank")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${type === "bank" ? "bg-accent-blue text-white" : "bg-surface-tertiary text-text-secondary"}`}
          >
            Bank Statement
          </button>
          <button
            onClick={() => setType("cc")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${type === "cc" ? "bg-accent-blue text-white" : "bg-surface-tertiary text-text-secondary"}`}
          >
            Credit Card
          </button>
        </div>

        <input
          type="file"
          accept=".pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-sm text-text-secondary file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-surface-tertiary file:text-text-primary file:font-medium file:cursor-pointer"
        />

        {type === "bank" && (
          <input
            type="text"
            placeholder="PDF Password (if encrypted)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none"
          />
        )}

        {error && <p className="text-accent-red text-sm">{error}</p>}
        {result && <p className="text-accent-green text-sm">Imported {result.imported} transactions!</p>}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 bg-surface-tertiary text-text-secondary rounded-lg text-sm hover:text-text-primary transition">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex-1 py-2.5 bg-accent-blue text-white rounded-lg text-sm font-medium disabled:opacity-50 transition"
          >
            {uploading ? "Uploading..." : "Upload & Parse"}
          </button>
        </div>
      </div>
    </div>
  );
}

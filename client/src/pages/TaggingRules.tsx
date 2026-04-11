import { useState, useEffect } from "react";
import { api } from "../services/api";

const iStyle = {
  background: "var(--color-surface-alt)", border: "1px solid var(--color-border)",
  borderRadius: "8px", color: "var(--color-text)", padding: "10px 14px",
  fontSize: "14px", outline: "none", width: "100%",
};

export default function TaggingRules() {
  const [rules, setRules]       = useState<any[]>([]);
  const [cats, setCats]         = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<any>(null);
  const [preview, setPreview]   = useState<any[] | null>(null);
  const [toast, setToast]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);

  const [pattern, setPattern]   = useState("");
  const [field, setField]       = useState("description");
  const [catId, setCatId]       = useState("");
  const [tag, setTag]           = useState("");
  const [priority, setPriority] = useState(0);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [r, c] = await Promise.all([api.getTaggingRules(), api.getCategories()]);
    setRules(r); setCats(c); setLoading(false);
  }

  function reset() {
    setPattern(""); setField("description"); setCatId(""); setTag(""); setPriority(0);
    setEditing(null); setShowForm(false); setPreview(null);
  }

  function startEdit(rule: any) {
    setPattern(rule.matchPattern); setField(rule.matchField);
    setCatId(rule.categoryId); setTag(rule.tagLabel || ""); setPriority(rule.priority);
    setEditing(rule); setShowForm(true); setPreview(null);
  }

  async function save() {
    const data = { matchPattern: pattern, matchField: field, categoryId: catId, tagLabel: tag || null, priority };
    if (editing) await api.updateTaggingRule(editing.id, data);
    else await api.createTaggingRule(data);
    reset(); loadData();
  }

  async function applyAll() {
    const res = await api.applyTaggingRules();
    setToast(`Updated ${res.updated} transactions`);
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="label mb-1">Automation</p>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>Tagging Rules</h1>
        </div>
        <div className="flex gap-3">
          <button onClick={applyAll}
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: "var(--color-surface-alt)", color: "var(--color-text-sub)" }}>
            Re-apply All
          </button>
          <button onClick={() => { reset(); setShowForm(true); }}
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{ background: "var(--color-blue)", color: "#fff" }}>
            + New Rule
          </button>
        </div>
      </div>

      {toast && (
        <div className="mb-5 px-5 py-3 rounded-lg text-sm font-medium"
          style={{ background: "var(--color-green-dim)", color: "var(--color-green)" }}>
          ✓ {toast}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="card p-6 mb-6">
          <h2 className="font-semibold text-base mb-5" style={{ color: "var(--color-text)" }}>
            {editing ? "Edit Rule" : "New Rule"}
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="label block mb-2">Match Pattern</label>
              <input type="text" value={pattern} onChange={e => setPattern(e.target.value)}
                placeholder="e.g. ZOMATO, GROWW, NETFLIX" style={iStyle} />
            </div>
            <div>
              <label className="label block mb-2">Match Field</label>
              <select value={field} onChange={e => setField(e.target.value)} style={iStyle}>
                <option value="description">Description</option>
                <option value="counterparty">Counterparty</option>
              </select>
            </div>
            <div>
              <label className="label block mb-2">Category</label>
              <select value={catId} onChange={e => setCatId(e.target.value)} style={iStyle}>
                <option value="">— Select category —</option>
                {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label block mb-2">Tag Label <span style={{ color: "var(--color-text-muted)" }}>(optional)</span></label>
              <input type="text" value={tag} onChange={e => setTag(e.target.value)}
                placeholder="e.g. Monthly Rent" style={iStyle} />
            </div>
            <div>
              <label className="label block mb-2">Priority</label>
              <input type="number" value={priority} onChange={e => setPriority(Number(e.target.value))} style={iStyle} />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => api.previewTaggingRule({ matchPattern: pattern, matchField: field }).then(setPreview)}
              disabled={!pattern}
              className="px-5 py-2.5 rounded-lg text-sm transition-all disabled:opacity-40"
              style={{ background: "var(--color-surface-alt)", color: "var(--color-text-sub)" }}>
              Test Match
            </button>
            <button onClick={save} disabled={!pattern || !catId}
              className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
              style={{ background: "var(--color-blue)", color: "#fff" }}>
              {editing ? "Update" : "Create Rule"}
            </button>
            <button onClick={reset} className="px-5 py-2.5 rounded-lg text-sm transition-all"
              style={{ color: "var(--color-text-muted)" }}>
              Cancel
            </button>
          </div>

          {preview && (
            <div className="mt-5" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "16px" }}>
              <p className="text-sm mb-3" style={{ color: "var(--color-text-sub)" }}>
                {preview.length} matching transactions
              </p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {preview.map((tx: any) => (
                  <div key={tx.id} className="flex justify-between px-3 py-2 rounded text-sm"
                    style={{ background: "var(--color-surface-alt)" }}>
                    <span style={{ color: "var(--color-text-sub)" }}>{tx.counterparty || tx.description?.substring(0, 50)}</span>
                    <span className="tabular-nums" style={{ color: "var(--color-text-muted)" }}>
                      ₹{tx.amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
                {preview.length === 0 && <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>No matches found.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rules table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border)", background: "rgba(30,41,59,0.5)" }}>
              <th className="text-left px-6 py-3.5 label">Pattern</th>
              <th className="text-left px-6 py-3.5 label">Field</th>
              <th className="text-left px-6 py-3.5 label">Category</th>
              <th className="text-left px-6 py-3.5 label">Tag</th>
              <th className="text-center px-6 py-3.5 label">Priority</th>
              <th className="px-6 py-3.5" />
            </tr>
          </thead>
          <tbody>
            {rules.map(rule => (
              <tr key={rule.id}
                style={{ borderBottom: "1px solid var(--color-border-light)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--color-hover)")}
                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                <td className="px-6 py-3.5 text-sm font-medium" style={{ color: "var(--color-amber)" }}>
                  {rule.matchPattern}
                </td>
                <td className="px-6 py-3.5 text-sm" style={{ color: "var(--color-text-sub)" }}>{rule.matchField}</td>
                <td className="px-6 py-3.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: rule.category?.color || "#475569" }} />
                    <span className="text-sm" style={{ color: "var(--color-text-sub)" }}>{rule.category?.name}</span>
                  </div>
                </td>
                <td className="px-6 py-3.5 text-sm" style={{ color: "var(--color-text-muted)" }}>
                  {rule.tagLabel || <span style={{ color: "var(--color-text-muted)" }}>—</span>}
                </td>
                <td className="px-6 py-3.5 text-sm text-center" style={{ color: "var(--color-text-sub)" }}>{rule.priority}</td>
                <td className="px-6 py-3.5">
                  <div className="flex gap-3 justify-end">
                    <button onClick={() => startEdit(rule)} className="text-sm transition-opacity hover:opacity-70"
                      style={{ color: "var(--color-blue)" }}>Edit</button>
                    <button onClick={() => api.deleteTaggingRule(rule.id).then(loadData)}
                      className="text-sm transition-opacity hover:opacity-70" style={{ color: "var(--color-red)" }}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rules.length === 0 && !loading && (
          <div className="py-20 text-center text-sm" style={{ color: "var(--color-text-muted)" }}>
            No rules yet. Create one to auto-categorize transactions.
          </div>
        )}
      </div>
    </div>
  );
}

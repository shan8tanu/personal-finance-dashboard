import { useState, useEffect } from "react";
import { api } from "../services/api";

export default function TaggingRules() {
  const [rules, setRules] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [matchPattern, setMatchPattern] = useState("");
  const [matchField, setMatchField] = useState("description");
  const [categoryId, setCategoryId] = useState("");
  const [tagLabel, setTagLabel] = useState("");
  const [priority, setPriority] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([api.getTaggingRules(), api.getCategories()]);
      setRules(r);
      setCategories(c);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setMatchPattern("");
    setMatchField("description");
    setCategoryId("");
    setTagLabel("");
    setPriority(0);
    setEditingRule(null);
    setShowForm(false);
    setPreview(null);
  }

  function startEdit(rule: any) {
    setMatchPattern(rule.matchPattern);
    setMatchField(rule.matchField);
    setCategoryId(rule.categoryId);
    setTagLabel(rule.tagLabel || "");
    setPriority(rule.priority);
    setEditingRule(rule);
    setShowForm(true);
    setPreview(null);
  }

  async function handleSave() {
    const data = { matchPattern, matchField, categoryId, tagLabel: tagLabel || null, priority };
    if (editingRule) {
      await api.updateTaggingRule(editingRule.id, data);
    } else {
      await api.createTaggingRule(data);
    }
    resetForm();
    loadData();
  }

  async function handleDelete(id: string) {
    await api.deleteTaggingRule(id);
    loadData();
  }

  async function handlePreview() {
    const result = await api.previewTaggingRule({ matchPattern, matchField });
    setPreview(result);
  }

  async function handleApplyAll() {
    const result = await api.applyTaggingRules();
    setApplyResult(`Updated ${result.updated} transactions`);
    setTimeout(() => setApplyResult(null), 3000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tagging Rules</h1>
          <p className="text-text-muted text-sm mt-0.5">Auto-categorize transactions by pattern matching</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleApplyAll}
            className="px-4 py-2.5 bg-surface-tertiary text-text-secondary hover:text-text-primary rounded-lg text-sm font-medium transition border border-border-primary"
          >
            Re-apply All Rules
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-accent-blue hover:bg-accent-blue/90 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
          >
            Add Rule
          </button>
        </div>
      </div>

      {applyResult && (
        <div className="bg-accent-green-dim border border-accent-green/30 text-accent-green text-sm px-4 py-3 rounded-lg">
          {applyResult}
        </div>
      )}

      {/* Rule Form */}
      {showForm && (
        <div className="bg-surface-secondary border border-border-primary rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-medium text-text-primary">
            {editingRule ? "Edit Rule" : "New Rule"}
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Match Pattern</label>
              <input
                type="text"
                value={matchPattern}
                onChange={(e) => setMatchPattern(e.target.value)}
                placeholder="e.g., VAISHALEE, ZOMATO, GROWW"
                className="w-full bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue transition"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Match Field</label>
              <select
                value={matchField}
                onChange={(e) => setMatchField(e.target.value)}
                className="w-full bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none"
              >
                <option value="description">Description</option>
                <option value="counterparty">Counterparty</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none"
              >
                <option value="">Select category...</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Tag Label (optional)</label>
              <input
                type="text"
                value={tagLabel}
                onChange={(e) => setTagLabel(e.target.value)}
                placeholder="e.g., Monthly Rent"
                className="w-full bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue transition"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">Priority (higher = matched first)</label>
              <input
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className="w-full bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent-blue transition"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handlePreview}
              disabled={!matchPattern || !matchField}
              className="px-4 py-2 bg-surface-tertiary text-text-secondary hover:text-text-primary rounded-lg text-sm transition border border-border-primary disabled:opacity-40"
            >
              Test Rule
            </button>
            <button
              onClick={handleSave}
              disabled={!matchPattern || !categoryId}
              className="px-4 py-2 bg-accent-blue text-white rounded-lg text-sm font-medium disabled:opacity-50 transition"
            >
              {editingRule ? "Update" : "Create"} Rule
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 text-text-muted hover:text-text-secondary text-sm transition"
            >
              Cancel
            </button>
          </div>

          {/* Preview Results */}
          {preview && (
            <div className="mt-4 border-t border-border-primary pt-4">
              <p className="text-xs text-text-muted mb-2">
                {preview.length} matching transaction{preview.length !== 1 ? "s" : ""} found:
              </p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {preview.map((tx: any) => (
                  <div key={tx.id} className="flex justify-between text-xs px-2 py-1.5 bg-surface-tertiary rounded">
                    <span className="text-text-secondary truncate max-w-xs">
                      {tx.counterparty || tx.description?.substring(0, 50)}
                    </span>
                    <span className="text-text-primary font-mono tabular-nums">
                      ₹{tx.amount.toLocaleString("en-IN")}
                    </span>
                  </div>
                ))}
                {preview.length === 0 && (
                  <p className="text-xs text-text-muted italic">No transactions match this pattern</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rules Table */}
      <div className="bg-surface-secondary border border-border-primary rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-primary">
              <th className="text-left px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Pattern</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Field</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Category</th>
              <th className="text-left px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Tag</th>
              <th className="text-center px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Priority</th>
              <th className="text-right px-4 py-3 text-text-muted font-medium text-xs uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-surface-hover transition">
                <td className="px-4 py-3 font-mono text-sm text-accent-amber">{rule.matchPattern}</td>
                <td className="px-4 py-3 text-text-secondary text-xs">{rule.matchField}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ background: rule.category?.color || "#6B7280" }} />
                    {rule.category?.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary text-xs">{rule.tagLabel || "—"}</td>
                <td className="px-4 py-3 text-center text-text-muted text-xs">{rule.priority}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => startEdit(rule)}
                    className="text-xs text-accent-blue hover:text-accent-blue/80 mr-3 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="text-xs text-accent-red hover:text-accent-red/80 transition"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {rules.length === 0 && !loading && (
          <div className="py-16 text-center text-text-muted text-sm">
            No tagging rules yet. Create one to auto-categorize transactions.
          </div>
        )}
      </div>
    </div>
  );
}

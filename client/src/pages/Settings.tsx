import { useState, useEffect } from "react";
import { api } from "../services/api";

export default function Settings() {
  const [categories, setCategories] = useState<any[]>([]);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState("expense");
  const [catColor, setCatColor] = useState("#6B7280");
  const [editingCat, setEditingCat] = useState<any>(null);
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    api.getCategories().then(setCategories).catch(console.error);
    // Construct webhook URL from current location
    const base = window.location.origin;
    setWebhookUrl(`${base}/api/webhook/sms`);
  }, []);

  async function handleSaveCategory() {
    if (editingCat) {
      await api.updateCategory(editingCat.id, { name: catName, type: catType, color: catColor });
    } else {
      await api.createCategory({ name: catName, type: catType, color: catColor });
    }
    resetCatForm();
    const cats = await api.getCategories();
    setCategories(cats);
  }

  async function handleDeleteCategory(id: string) {
    try {
      await api.deleteCategory(id);
      const cats = await api.getCategories();
      setCategories(cats);
    } catch (err: any) {
      alert(err.message);
    }
  }

  function startEditCat(cat: any) {
    setCatName(cat.name);
    setCatType(cat.type);
    setCatColor(cat.color);
    setEditingCat(cat);
    setShowCatForm(true);
  }

  function resetCatForm() {
    setCatName("");
    setCatType("expense");
    setCatColor("#6B7280");
    setEditingCat(null);
    setShowCatForm(false);
  }

  const typeGroups = ["income", "expense", "investment", "transfer", "fee"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-text-muted text-sm mt-0.5">Manage categories, webhooks, and preferences</p>
      </div>

      {/* SMS Webhook */}
      <div className="bg-surface-secondary border border-border-primary rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-medium text-text-primary">SMS Webhook (Tasker/Automate)</h2>
        <p className="text-xs text-text-muted">
          Configure your Android automation app to POST SMS messages to this URL.
          Include the header <code className="bg-surface-tertiary px-1.5 py-0.5 rounded text-accent-amber text-[11px] font-mono">X-Webhook-Secret</code> with your secret.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={webhookUrl}
            className="flex-1 bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2.5 text-sm font-mono text-text-secondary focus:outline-none"
          />
          <button
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
            className="px-4 py-2.5 bg-surface-tertiary border border-border-primary text-text-secondary hover:text-text-primary rounded-lg text-sm transition"
          >
            Copy
          </button>
        </div>
        <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono text-text-muted">
          <p className="text-text-secondary mb-1">Example POST body:</p>
          <pre>{`{
  "message": "INR 1,234.56 debited from A/c **8085 on 01-04-26. UPI Ref: 123456",
  "sender": "HDFCBK",
  "timestamp": "2026-04-01T10:30:00Z"
}`}</pre>
        </div>
      </div>

      {/* Categories Management */}
      <div className="bg-surface-secondary border border-border-primary rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border-primary flex items-center justify-between">
          <h2 className="text-sm font-medium text-text-primary">Categories</h2>
          <button
            onClick={() => { resetCatForm(); setShowCatForm(true); }}
            className="px-3 py-1.5 bg-accent-blue text-white rounded-lg text-xs font-medium transition hover:bg-accent-blue/90"
          >
            Add Category
          </button>
        </div>

        {/* Category Form */}
        {showCatForm && (
          <div className="px-5 py-4 border-b border-border-primary bg-surface-primary/50 space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <input
                type="text"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="Category name"
                className="col-span-2 bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none"
              />
              <select
                value={catType}
                onChange={(e) => setCatType(e.target.value)}
                className="bg-surface-tertiary border border-border-primary rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="investment">Investment</option>
                <option value="transfer">Transfer</option>
                <option value="fee">Fee</option>
              </select>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                  className="w-9 h-9 rounded-lg border border-border-primary cursor-pointer bg-transparent"
                />
                <button
                  onClick={handleSaveCategory}
                  disabled={!catName}
                  className="flex-1 bg-accent-blue text-white rounded-lg py-2 text-xs font-medium disabled:opacity-50 transition"
                >
                  {editingCat ? "Update" : "Add"}
                </button>
                <button onClick={resetCatForm} className="text-text-muted text-xs hover:text-text-secondary">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Category List grouped by type */}
        {typeGroups.map((type) => {
          const typeCats = categories.filter((c) => c.type === type);
          if (typeCats.length === 0) return null;
          return (
            <div key={type}>
              <div className="px-5 py-2 bg-surface-primary/30">
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  {type}
                </span>
              </div>
              <div className="divide-y divide-border-primary">
                {typeCats.map((cat) => (
                  <div key={cat.id} className="px-5 py-2.5 flex items-center justify-between hover:bg-surface-hover transition">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                      <span className="text-sm text-text-primary">{cat.name}</span>
                      {cat.isDefault && (
                        <span className="text-[10px] bg-surface-tertiary text-text-muted px-1.5 py-0.5 rounded">default</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditCat(cat)}
                        className="text-xs text-accent-blue hover:text-accent-blue/80 transition"
                      >
                        Edit
                      </button>
                      {!cat.isDefault && (
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="text-xs text-accent-red hover:text-accent-red/80 transition"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

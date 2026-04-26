import { useState, useEffect } from "react";
import { api } from "../services/api";

const iStyle = {
  background: "var(--color-surface-alt)", border: "1px solid var(--color-border)",
  borderRadius: "8px", color: "var(--color-text)", padding: "10px 14px",
  fontSize: "14px", outline: "none", width: "100%",
};

const TYPE_GROUPS = ["income", "expense", "investment", "transfer", "fee"];

export default function Settings() {
  const [categories, setCategories] = useState<any[]>([]);
  const [showForm, setShowForm]     = useState(false);
  const [catName, setCatName]       = useState("");
  const [catType, setCatType]       = useState("expense");
  const [catColor, setCatColor]     = useState("#6B7280");
  const [editing, setEditing]       = useState<any>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [secretVisible, setSecretVisible] = useState(false);
  const [copiedField, setCopiedField]     = useState<"url" | "secret" | "curl" | null>(null);

  useEffect(() => {
    api.getCategories().then(setCategories);
    const url = `${window.location.origin}/api/webhook/sms`;
    setWebhookUrl(url);
    api.getWebhookConfig().then((d: any) => setWebhookSecret(d.secret || "")).catch(() => {});
  }, []);

  function copyToClipboard(text: string, field: "url" | "secret" | "curl") {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 1800);
    });
  }

  const curlCommand = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Secret: ${webhookSecret || "<your-secret>"}" \\
  -d '{"message":"INR 150.00 debited from A/c **8085 on 26-04-26. Info: UPI-ZOMATO-zomato@upi. UPI Ref:999888777666. Avl Bal:INR 12345.00"}'`;

  async function saveCategory() {
    if (editing) await api.updateCategory(editing.id, { name: catName, type: catType, color: catColor });
    else await api.createCategory({ name: catName, type: catType, color: catColor });
    resetForm();
    setCategories(await api.getCategories());
  }

  async function deleteCategory(id: string) {
    try { await api.deleteCategory(id); setCategories(await api.getCategories()); }
    catch (err: any) { alert(err.message); }
  }

  function startEdit(cat: any) {
    setCatName(cat.name); setCatType(cat.type); setCatColor(cat.color);
    setEditing(cat); setShowForm(true);
  }

  function resetForm() {
    setCatName(""); setCatType("expense"); setCatColor("#6B7280");
    setEditing(null); setShowForm(false);
  }

  return (
    <div>
      <div className="mb-8">
        <p className="label mb-1">Configuration</p>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>Settings</h1>
      </div>

      {/* SMS Webhook */}
      <div className="card p-6 mb-6">
        <h2 className="font-semibold text-base mb-1" style={{ color: "var(--color-text)" }}>SMS Webhook</h2>
        <p className="text-sm mb-5" style={{ color: "var(--color-text-muted)" }}>
          Configure Tasker or MacroDroid to POST incoming HDFC SMS to this endpoint.
          Include an <code className="px-1.5 py-0.5 rounded text-xs"
            style={{ background: "var(--color-surface-alt)", color: "var(--color-amber)" }}>
            X-Webhook-Secret
          </code> header with the secret shown below.
        </p>

        {/* Endpoint URL */}
        <p className="label mb-2">Endpoint URL</p>
        <div className="flex gap-3 mb-4">
          <input readOnly value={webhookUrl}
            style={{ ...iStyle, color: "var(--color-text-sub)", flex: 1 }} />
          <button onClick={() => copyToClipboard(webhookUrl, "url")}
            className="px-5 py-2.5 rounded-lg text-sm transition-all"
            style={{ background: "var(--color-surface-alt)", color: copiedField === "url" ? "var(--color-green)" : "var(--color-text-sub)", minWidth: 72 }}>
            {copiedField === "url" ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Webhook secret */}
        <p className="label mb-2">Webhook Secret  <span style={{ color: "var(--color-text-muted)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— paste this into Tasker's X-Webhook-Secret header</span></p>
        <div className="flex gap-3 mb-5">
          <div style={{ flex: 1, position: "relative" }}>
            <input
              readOnly
              type={secretVisible ? "text" : "password"}
              value={webhookSecret || "Set WEBHOOK_SECRET in server/.env"}
              style={{ ...iStyle, paddingRight: 44, color: webhookSecret ? "var(--color-text)" : "var(--color-text-muted)", fontFamily: secretVisible ? "monospace" : undefined }}
            />
            <button
              onClick={() => setSecretVisible(v => !v)}
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 15, padding: 0 }}
              title={secretVisible ? "Hide" : "Show"}>
              {secretVisible ? "🙈" : "👁"}
            </button>
          </div>
          <button onClick={() => copyToClipboard(webhookSecret, "secret")} disabled={!webhookSecret}
            className="px-5 py-2.5 rounded-lg text-sm transition-all disabled:opacity-40"
            style={{ background: "var(--color-surface-alt)", color: copiedField === "secret" ? "var(--color-green)" : "var(--color-text-sub)", minWidth: 72 }}>
            {copiedField === "secret" ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* Test curl command */}
        <div className="rounded-lg p-4" style={{ background: "var(--color-base)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="label">Test with curl</p>
            <button onClick={() => copyToClipboard(curlCommand, "curl")}
              className="text-xs px-3 py-1 rounded transition-all"
              style={{ background: "var(--color-surface-alt)", color: copiedField === "curl" ? "var(--color-green)" : "var(--color-text-muted)" }}>
              {copiedField === "curl" ? "✓ Copied" : "Copy"}
            </button>
          </div>
          <pre className="text-xs" style={{ color: "var(--color-text-sub)", fontFamily: "monospace", lineHeight: "1.7", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{curlCommand}</pre>
          <p className="text-xs mt-3" style={{ color: "var(--color-text-muted)" }}>
            A 201 response means the transaction was created. 422 = SMS format not recognized. 401 = wrong secret.
          </p>
        </div>
      </div>

      {/* Categories */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-border)" }}>
          <h2 className="font-semibold text-base" style={{ color: "var(--color-text)" }}>Categories</h2>
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: "var(--color-blue-dim)", color: "var(--color-blue)" }}>
            + Add Category
          </button>
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--color-border)", background: "rgba(15,23,42,0.5)" }}>
            <p className="font-medium text-sm mb-4" style={{ color: "var(--color-text)" }}>
              {editing ? "Edit Category" : "New Category"}
            </p>
            <div className="grid grid-cols-4 gap-4 items-end">
              <div className="col-span-2">
                <label className="label block mb-2">Name</label>
                <input type="text" value={catName} onChange={e => setCatName(e.target.value)}
                  placeholder="e.g. Groceries" style={iStyle} />
              </div>
              <div>
                <label className="label block mb-2">Type</label>
                <select value={catType} onChange={e => setCatType(e.target.value)} style={iStyle}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="investment">Investment</option>
                  <option value="transfer">Transfer</option>
                  <option value="fee">Fee</option>
                </select>
              </div>
              <div className="flex gap-3 items-end">
                <div>
                  <label className="label block mb-2">Color</label>
                  <input type="color" value={catColor} onChange={e => setCatColor(e.target.value)}
                    className="w-10 h-10 rounded-lg cursor-pointer"
                    style={{ border: "1px solid var(--color-border)", background: "transparent" }} />
                </div>
                <button onClick={saveCategory} disabled={!catName}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40"
                  style={{ background: "var(--color-blue)", color: "#fff" }}>
                  {editing ? "Update" : "Add"}
                </button>
                <button onClick={resetForm} className="text-sm" style={{ color: "var(--color-text-muted)" }}>✕</button>
              </div>
            </div>
          </div>
        )}

        {/* Category list grouped by type */}
        {TYPE_GROUPS.map(type => {
          const typeCats = categories.filter(c => c.type === type);
          if (!typeCats.length) return null;
          return (
            <div key={type}>
              <div className="px-6 py-2.5" style={{ background: "rgba(15,23,42,0.4)", borderBottom: "1px solid var(--color-border)" }}>
                <p className="label">{type.charAt(0).toUpperCase() + type.slice(1)}</p>
              </div>
              {typeCats.map(cat => (
                <div key={cat.id} className="flex items-center justify-between px-6 py-3.5"
                  style={{ borderBottom: "1px solid var(--color-border-light)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--color-hover)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                    <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{cat.name}</span>
                    {cat.isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded"
                        style={{ background: "var(--color-surface-alt)", color: "var(--color-text-muted)" }}>
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => startEdit(cat)} className="text-sm transition-opacity hover:opacity-70"
                      style={{ color: "var(--color-blue)" }}>Edit</button>
                    {!cat.isDefault && (
                      <button onClick={() => deleteCategory(cat.id)} className="text-sm transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-red)" }}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

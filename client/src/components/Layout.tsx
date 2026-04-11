import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../services/api";

const NAV = [
  { path: "/",             label: "Dashboard"     },
  { path: "/transactions", label: "Transactions"  },
  { path: "/credit-card",  label: "Credit Card"   },
  { path: "/investments",  label: "Investments"   },
  { path: "/rules",        label: "Tagging Rules" },
  { path: "/settings",     label: "Settings"      },
];

export function UploadModal({ onClose }: { onClose: () => void }) {
  const [file, setFile]       = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [uploading, setUploading] = useState(false);
  const [result, setResult]   = useState<string | null>(null);
  const [error, setError]     = useState("");
  const [type, setType]       = useState<"bank" | "cc">("bank");

  async function upload() {
    if (!file) return;
    setUploading(true); setError(""); setResult(null);
    try {
      const res = type === "bank"
        ? await api.uploadBankStatement(file, password || undefined)
        : await api.uploadCreditCardStatement(file);
      setResult(`✓ Imported ${res.imported} transactions`);
      setTimeout(onClose, 1800);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    } finally { setUploading(false); }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#1e293b", border: "1px solid #334155", borderRadius: 12,
        padding: 32, width: 440, maxWidth: "95vw"
      }}>
        <h2 style={{ color: "#f1f5f9", fontSize: 17, fontWeight: 600, marginBottom: 20 }}>Upload Statement</h2>

        {/* Type tabs */}
        <div style={{ display: "flex", background: "#0f172a", borderRadius: 8, padding: 4, marginBottom: 20 }}>
          {(["bank", "cc"] as const).map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer",
              background: type === t ? "#3b82f6" : "transparent",
              color: type === t ? "#fff" : "#94a3b8"
            }}>
              {t === "bank" ? "Bank Statement" : "Credit Card"}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>
            PDF File
          </label>
          <input type="file" accept=".pdf" onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ color: "#94a3b8", fontSize: 13, width: "100%" }} />
        </div>

        {type === "bank" && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>
              PDF Password (if encrypted)
            </label>
            <input type="text" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Leave blank if not encrypted"
              style={{ width: "100%", background: "#263244", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9", padding: "10px 14px", fontSize: 14, outline: "none" }} />
          </div>
        )}

        {error  && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>}
        {result && <p style={{ color: "#22c55e", fontSize: 13, marginBottom: 12 }}>{result}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "10px 0", borderRadius: 8, background: "#263244",
            color: "#94a3b8", fontSize: 14, border: "none", cursor: "pointer"
          }}>Cancel</button>
          <button onClick={upload} disabled={!file || uploading} style={{
            flex: 1, padding: "10px 0", borderRadius: 8, background: "#3b82f6",
            color: "#fff", fontSize: 14, fontWeight: 500, border: "none",
            cursor: file && !uploading ? "pointer" : "not-allowed", opacity: !file || uploading ? 0.5 : 1
          }}>
            {uploading ? "Parsing…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0f172a" }}>

      {/* Sidebar */}
      <aside style={{
        width: 220, flexShrink: 0, display: "flex", flexDirection: "column",
        background: "#1e293b", borderRight: "1px solid #334155"
      }}>
        {/* Brand */}
        <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid #334155" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8, background: "#3b82f6",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 16, fontWeight: 700, flexShrink: 0
            }}>₹</div>
            <div>
              <div style={{ color: "#f1f5f9", fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>Findash</div>
              <div style={{ color: "#64748b", fontSize: 11, lineHeight: 1.4 }}>Personal Finance</div>
            </div>
          </div>
        </div>

        {/* Upload button */}
        <div style={{ padding: "16px 12px 8px" }}>
          <button onClick={() => setShowUpload(true)} style={{
            width: "100%", padding: "9px 0", borderRadius: 8, background: "#3b82f620",
            color: "#3b82f6", fontSize: 13, fontWeight: 500, border: "1px solid #3b82f640", cursor: "pointer"
          }}>
            + Upload Statement
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
          {NAV.map(item => (
            <NavLink key={item.path} to={item.path} end={item.path === "/"}>
              {({ isActive }) => (
                <div style={{
                  display: "block", padding: "10px 12px", borderRadius: 8, marginBottom: 2,
                  background: isActive ? "#3b82f620" : "transparent",
                  color: isActive ? "#3b82f6" : "#94a3b8",
                  fontSize: 14, fontWeight: isActive ? 500 : 400, cursor: "pointer",
                  borderLeft: `3px solid ${isActive ? "#3b82f6" : "transparent"}`
                }}>
                  {item.label}
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Sign out */}
        <div style={{ padding: "12px", borderTop: "1px solid #334155" }}>
          <button onClick={() => { localStorage.removeItem("token"); navigate("/login"); }}
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 8, background: "transparent",
              color: "#64748b", fontSize: 14, border: "none", cursor: "pointer", textAlign: "left"
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
            onMouseLeave={e => (e.currentTarget.style.color = "#64748b")}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflowY: "auto", background: "#0f172a" }}>
        <div style={{ maxWidth: 1600, margin: "0 auto", padding: "32px 40px" }}>
          {children}
        </div>
      </main>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
}

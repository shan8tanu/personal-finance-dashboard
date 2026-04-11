import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { token } = await api.login(username, password);
      localStorage.setItem("token", token);
      onLogin();
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const iStyle = {
    background: "var(--color-surface)", border: "1px solid var(--color-border)",
    borderRadius: "8px", color: "var(--color-text)", padding: "12px 16px",
    fontSize: "15px", outline: "none", width: "100%",
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--color-base)" }}>
      <div style={{ width: "380px" }}>

        {/* Brand */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-bold"
            style={{ background: "var(--color-blue)", color: "#fff" }}>
            ₹
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--color-text)" }}>Findash</p>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>Personal Finance Dashboard</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg text-sm"
              style={{ background: "var(--color-red-dim)", color: "var(--color-red)" }}>
              {error}
            </div>
          )}

          <div>
            <label className="label block mb-2">Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              style={iStyle} autoFocus autoComplete="username" />
          </div>

          <div>
            <label className="label block mb-2">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              style={iStyle} autoComplete="current-password" />
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 rounded-lg font-medium transition-all disabled:opacity-50"
            style={{ background: "var(--color-blue)", color: "#fff", fontSize: "15px", marginTop: "8px" }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs mt-8" style={{ color: "var(--color-text-muted)" }}>
          Runs locally · Your data stays private
        </p>
      </div>
    </div>
  );
}

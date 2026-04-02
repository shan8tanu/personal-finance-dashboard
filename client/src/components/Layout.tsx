import { NavLink, useNavigate } from "react-router-dom";

const navItems = [
  { path: "/", label: "Dashboard", icon: "◎" },
  { path: "/transactions", label: "Transactions", icon: "⇄" },
  { path: "/credit-card", label: "Credit Card", icon: "▤" },
  { path: "/investments", label: "Investments", icon: "△" },
  { path: "/rules", label: "Tagging Rules", icon: "⚙" },
  { path: "/settings", label: "Settings", icon: "☰" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-surface-secondary border-r border-border-primary flex flex-col">
        <div className="p-5 border-b border-border-primary">
          <h1 className="text-lg font-semibold tracking-tight text-text-primary">
            <span className="text-accent-green">₹</span> FinDash
          </h1>
          <p className="text-xs text-text-muted mt-0.5">Personal Finance</p>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? "bg-surface-tertiary text-text-primary font-medium"
                    : "text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`
              }
            >
              <span className="text-base w-5 text-center opacity-70">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border-primary">
          <button
            onClick={logout}
            className="w-full px-3 py-2 text-sm text-text-muted hover:text-accent-red hover:bg-accent-red-dim rounded-lg transition-all duration-150"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-surface-primary">
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

import { LogOut, Moon, Sun, User } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { getFirstName } from "../../utils/user";
import { useState } from "react";

export default function Topbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("studypilot_theme") || "light");
  const firstName = getFirstName(user);

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("studypilot_theme", nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  };

  return (
    <header className="sticky top-0 z-20 border-b border-pilot-line bg-white/86 px-4 py-4 backdrop-blur md:px-8">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <button onClick={toggleTheme} className="grid h-11 w-11 place-items-center rounded-2xl border border-pilot-line bg-white text-pilot-muted transition hover:text-pilot-blue" aria-label="Toggle dark mode">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="relative">
            <button onClick={() => setOpen((current) => !current)} className="grid h-11 w-11 place-items-center rounded-2xl bg-pilot-blue text-sm font-black text-white transition hover:bg-blue-700" aria-label="Open profile menu">
              {firstName[0]?.toUpperCase() || "S"}
            </button>
            {open && (
              <div className="absolute right-0 mt-3 w-56 rounded-2xl border border-pilot-line bg-white p-2 shadow-pilot">
                <Link to="/student/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-pilot-muted transition hover:bg-pilot-soft hover:text-pilot-blue">
                  <User size={16} />
                  Profile
                </Link>
                <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold text-red-600 transition hover:bg-red-50">
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

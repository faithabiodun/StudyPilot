import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import LogoMark from "../common/LogoMark";
import { navItems } from "../../data/mockData";
import { cn } from "../../utils/cn";
import { useAuth } from "../../context/AuthContext";
import { getFirstName } from "../../utils/user";

export default function Sidebar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const firstName = getFirstName(user);

  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col bg-pilot-blue px-4 py-5 text-white shadow-glow lg:flex">
      <Link to="/" aria-label="Go to StudyPilot homepage" className="flex cursor-pointer items-center gap-3 px-2 transition hover:opacity-85">
        <LogoMark />
        <div>
          <p className="text-xl font-black">StudyPilot</p>
        </div>
      </Link>
      <nav className="mt-8 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-blue-100 transition hover:bg-white/15 hover:text-white",
                isActive && "bg-white text-pilot-blue shadow-soft hover:bg-white hover:text-pilot-blue"
              )
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto rounded-2xl bg-white/10 p-3">
        <p className="text-sm font-black">Signed in as {firstName}</p>
        <button onClick={signOut} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-black text-pilot-blue transition hover:bg-blue-50">
          <LogOut size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

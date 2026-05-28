import { Outlet } from "react-router-dom";
import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";
import { NavLink } from "react-router-dom";
import { navItems } from "../data/mockData";
import { cn } from "../utils/cn";

export default function StudentLayout() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-pilot-ice">
      <Sidebar />
      <main className="min-w-0 lg:pl-72">
        <Topbar />
        <div className="min-w-0 p-4 pb-24 md:p-8">
          <Outlet />
        </div>
      </main>
      <nav className="fixed bottom-3 left-3 right-3 z-40 flex gap-1 overflow-x-auto rounded-[1.5rem] border border-pilot-line bg-white/95 p-2 shadow-pilot backdrop-blur lg:hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn("grid min-w-20 place-items-center rounded-2xl px-2 py-2 text-xs font-bold text-pilot-muted", isActive && "bg-pilot-blue text-white")}
          >
            <item.icon size={18} />
            <span className="mt-1">{item.label.split(" ")[0]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

import { Outlet } from "react-router-dom";
import Sidebar from "../components/layout/Sidebar";
import Topbar from "../components/layout/Topbar";

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-pilot-ice">
      <Sidebar />
      <main className="lg:pl-72">
        <Topbar />
        <div className="p-4 md:p-7">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

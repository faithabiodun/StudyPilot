import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function ActionCard({ title, text, icon: Icon, path, button = "Open" }) {
  return (
    <Link to={path} className="group rounded-[1.5rem] border border-pilot-line bg-white p-5 shadow-soft transition hover:-translate-y-1 hover:border-pilot-blue hover:shadow-pilot">
      <div className="flex items-start justify-between">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue">
          <Icon size={23} />
        </span>
        <ArrowRight className="text-pilot-muted transition group-hover:translate-x-1 group-hover:text-pilot-blue" size={18} />
      </div>
      <h3 className="mt-5 text-lg font-black text-pilot-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-pilot-muted">{text}</p>
      <span className="mt-5 inline-flex rounded-xl bg-pilot-blue px-3 py-2 text-xs font-black text-white">{button}</span>
    </Link>
  );
}

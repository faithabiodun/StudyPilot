import { X } from "lucide-react";
import Button from "./Button";

export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-pilot-ink/40 p-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-[1.5rem] bg-white p-5 shadow-pilot">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-pilot-ink">{title}</h2>
          <Button variant="ghost" icon={X} onClick={onClose} className="h-9 w-9 px-0" aria-label="Close" />
        </div>
        {children}
      </div>
    </div>
  );
}

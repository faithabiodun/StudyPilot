import { Send } from "lucide-react";
import Button from "../common/Button";

export default function ChatInput({ value, onChange, onSubmit, disabled }) {
  return (
    <form onSubmit={onSubmit} className="flex gap-3 rounded-2xl border border-pilot-line bg-white p-2 shadow-soft">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-pilot-ink outline-none"
        placeholder="Ask anything..."
      />
      <Button icon={Send} disabled={disabled}>Send</Button>
    </form>
  );
}

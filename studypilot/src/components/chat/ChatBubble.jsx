import { Bot, UserRound } from "lucide-react";

function renderInline(text) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function isTableLine(line) {
  return line.includes("|") && line.split("|").filter(Boolean).length >= 2;
}

function isSeparatorLine(line) {
  return /^[\s|:-]+$/.test(line) && line.includes("-");
}

function renderFormattedText(text, user) {
  if (typeof text !== "string") return text;
  const lines = text.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (isTableLine(line)) {
      const tableLines = [];
      while (index < lines.length && isTableLine(lines[index])) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      const rows = tableLines.filter((row) => !isSeparatorLine(row)).map((row) => row.split("|").map((cell) => cell.trim()).filter(Boolean));
      if (rows.length > 1) {
        blocks.push(
          <div key={`table-${index}`} className="my-3 overflow-x-auto">
            <table className={`w-full min-w-80 text-left text-xs ${user ? "text-white" : "text-pilot-ink"}`}>
              <thead>
                <tr>{rows[0].map((cell) => <th key={cell} className="border-b border-pilot-line px-2 py-2 font-black">{renderInline(cell)}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className="border-b border-pilot-line px-2 py-2">{renderInline(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    if (line.startsWith("- ")) {
      const items = [];
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`} className="my-2 list-disc space-y-1 pl-5">{items.map((item) => <li key={item}>{renderInline(item)}</li>)}</ul>);
      continue;
    }

    if (/^#{1,4}\s+/.test(line)) {
      const heading = line.replace(/^#{1,4}\s+/, "");
      blocks.push(<h4 key={`h-${index}`} className="mb-1 mt-3 text-sm font-black">{renderInline(heading)}</h4>);
      index += 1;
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s/, ""));
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`} className="my-2 list-decimal space-y-1 pl-5">{items.map((item) => <li key={item}>{renderInline(item)}</li>)}</ol>);
      continue;
    }

    blocks.push(<p key={`p-${index}`} className="my-1">{renderInline(line)}</p>);
    index += 1;
  }

  return blocks;
}

export default function ChatBubble({ role, children }) {
  const user = role === "user";
  return (
    <div className={`flex gap-3 ${user ? "justify-end" : "justify-start"}`}>
      {!user && <div className="grid h-9 w-9 place-items-center rounded-2xl bg-pilot-soft text-pilot-blue"><Bot size={17} /></div>}
      <div className={`max-w-[82%] rounded-[1.25rem] px-4 py-3 text-sm leading-6 shadow-soft ${user ? "bg-pilot-blue text-white" : "border border-pilot-line bg-white text-pilot-ink"}`}>
        {renderFormattedText(children, user)}
      </div>
      {user && <div className="grid h-9 w-9 place-items-center rounded-2xl bg-pilot-ink text-white"><UserRound size={17} /></div>}
    </div>
  );
}

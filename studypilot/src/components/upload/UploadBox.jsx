import { UploadCloud } from "lucide-react";

export default function UploadBox({ fileName, onFile }) {
  return (
    <label className="flex cursor-pointer flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-pilot-blue bg-pilot-sky p-10 text-center transition hover:bg-pilot-soft">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white text-pilot-blue shadow-soft">
        <UploadCloud size={30} />
      </div>
      <p className="mt-4 text-lg font-black text-pilot-ink">{fileName || "Drag & drop your files here"}</p>
      <p className="mt-1 text-sm text-pilot-muted">or click to upload one readable PDF</p>
      <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => onFile(event.target.files?.[0])} />
    </label>
  );
}

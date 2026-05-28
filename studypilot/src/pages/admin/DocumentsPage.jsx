import { UploadCloud } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Select from "../../components/common/Select";
import DataTable from "../../components/admin/DataTable";
import { documents } from "../../data/mockData";

export default function DocumentsPage() {
  return (
    <div>
      <PageHeader title="Academic Documents" subtitle="Active documents help StudyPilot provide grounded academic responses." />
      <section className="mb-6 rounded-2xl border border-flight-line bg-flight-card p-6 shadow-panel">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Input label="Document Title" placeholder="Student Handbook" />
          <Select label="Document Type">
            {["Student Handbook", "Academic Policy", "Course Outline", "Department Guide", "FAQ"].map((item) => <option key={item}>{item}</option>)}
          </Select>
          <Input label="Department" placeholder="Computer Science" />
          <Select label="Status"><option>Active</option><option>Review</option><option>Archived</option></Select>
          <Button icon={UploadCloud} className="self-end">Upload PDF</Button>
        </div>
      </section>
      <DataTable columns={[
        { key: "title", label: "Document Title" },
        { key: "type", label: "Document Type" },
        { key: "department", label: "Department" },
        { key: "status", label: "Status" }
      ]} rows={documents} />
    </div>
  );
}

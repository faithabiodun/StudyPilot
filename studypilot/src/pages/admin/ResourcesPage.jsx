import { Plus } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Select from "../../components/common/Select";
import DataTable from "../../components/admin/DataTable";
import { resources } from "../../data/mockData";

export default function ResourcesPage() {
  return (
    <div>
      <PageHeader title="Manage Resources" subtitle="Curate the recommended links surfaced in Resource Hub." actions={<Button icon={Plus}>Add Resource</Button>} />
      <section className="mb-6 rounded-2xl border border-flight-line bg-flight-card p-6 shadow-panel">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input label="Resource Title" placeholder="Compiler Construction Tutorial" />
          <Input label="URL" placeholder="https://..." />
          <Select label="Resource Type">{["YouTube", "Textbook", "PDF", "Article", "Documentation"].map((item) => <option key={item}>{item}</option>)}</Select>
          <Input label="Course Tag" placeholder="CSC 415" />
          <Input label="Topic Tag" placeholder="Parsing" />
          <Select label="Difficulty">{["Beginner", "Intermediate", "Advanced"].map((item) => <option key={item}>{item}</option>)}</Select>
          <Input label="Description" placeholder="Short resource description" />
          <Select label="Approval Status"><option>Approved</option><option>Pending</option><option>Rejected</option></Select>
        </div>
      </section>
      <DataTable columns={[
        { key: "title", label: "Resource Title" },
        { key: "type", label: "Resource Type" },
        { key: "course", label: "Course Tag" },
        { key: "topic", label: "Topic Tag" },
        { key: "difficulty", label: "Difficulty" },
        { key: "description", label: "Description" }
      ]} rows={resources} />
    </div>
  );
}

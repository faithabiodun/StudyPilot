import { Plus } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import Button from "../../components/common/Button";
import Input from "../../components/common/Input";
import Select from "../../components/common/Select";
import DataTable from "../../components/admin/DataTable";
import { courses } from "../../data/mockData";

export default function CoursesPage() {
  return (
    <div>
      <PageHeader title="Manage Courses" subtitle="Add, edit, and delete courses used across advising, quizzes, flashcards, and resources." actions={<Button icon={Plus}>Add Course</Button>} />
      <section className="mb-6 rounded-2xl border border-flight-line bg-flight-card p-6 shadow-panel">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Input label="Course Code" placeholder="CSC 310" />
          <Input label="Course Title" placeholder="Database Systems" />
          <Input label="Department" placeholder="Computer Science" />
          <Select label="Level"><option>100</option><option>200</option><option>300</option><option>400</option></Select>
          <Input label="Description" placeholder="Course description" />
        </div>
      </section>
      <DataTable columns={[
        { key: "code", label: "Course Code" },
        { key: "title", label: "Course Title" },
        { key: "department", label: "Department" },
        { key: "level", label: "Level" },
        { key: "description", label: "Description" }
      ]} rows={courses} />
    </div>
  );
}

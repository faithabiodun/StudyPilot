import PageHeader from "../../components/layout/PageHeader";
import DataTable from "../../components/admin/DataTable";
import { users } from "../../data/mockData";

export default function UsersPage() {
  return (
    <div>
      <PageHeader title="Users" subtitle="View platform users and manage access status." />
      <DataTable
        columns={[
          { key: "name", label: "Name" },
          { key: "email", label: "Email" },
          { key: "role", label: "Role" },
          { key: "joined", label: "Date Joined" },
          { key: "status", label: "Status" }
        ]}
        rows={users}
        actions={["View", "Deactivate", "Delete"]}
      />
    </div>
  );
}

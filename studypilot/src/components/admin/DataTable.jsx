import Button from "../common/Button";

export default function DataTable({ columns, rows, actions = ["Edit", "Delete"] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-flight-line bg-flight-card shadow-panel">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-flight-blueSoft text-flight-ink">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-black">
                  {column.label}
                </th>
              ))}
              <th className="px-4 py-3 font-black">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-flight-line">
            {rows.map((row, index) => (
              <tr key={`${row.title || row.name || row.code}-${index}`} className="hover:bg-flight-cloud">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-4 text-flight-muted">
                    {row[column.key]}
                  </td>
                ))}
                <td className="px-4 py-4">
                  <div className="flex gap-2">
                    {actions.map((action) => (
                      <Button key={action} variant={action === "Delete" || action === "Deactivate" ? "danger" : "secondary"} className="px-3 py-2 text-xs">
                        {action}
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

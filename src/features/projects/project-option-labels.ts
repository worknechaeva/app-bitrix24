import type { Bitrix24Employee } from "@/integrations/bitrix24/directory-client";

function employeeName(employee: Bitrix24Employee) {
  return (
    [employee.lastName, employee.name, employee.middleName].filter(Boolean).join(" ") ||
    `Сотрудник #${employee.id}`
  );
}

export function employeeOptionLabel(employee: Bitrix24Employee, employees: Bitrix24Employee[]) {
  const name = employeeName(employee);
  const sameName = employees.filter((candidate) => employeeName(candidate) === name);
  if (sameName.length < 2) return name;

  return [
    name,
    employee.position,
    employee.departmentIds.length > 0 ? `подразделение ${employee.departmentIds.join(", ")}` : undefined,
    `ID ${employee.id}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

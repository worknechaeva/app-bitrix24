import { describe, expect, it } from "vitest";
import { employeeOptionLabel } from "@/features/projects/project-option-labels";

const employees = [
  {
    id: "101",
    name: "Анна",
    lastName: "Волкова",
    position: "Разработчик",
    departmentIds: ["7"],
  },
  {
    id: "102",
    name: "Анна",
    lastName: "Волкова",
    position: "Руководитель",
    departmentIds: ["8"],
  },
  {
    id: "103",
    name: "Максим",
    lastName: "Орлов",
    position: "Разработчик",
    departmentIds: ["7"],
  },
];

describe("employee option labels", () => {
  it("adds Directory details only when names are ambiguous", () => {
    expect(employeeOptionLabel(employees[0], employees)).toBe(
      "Волкова Анна · Разработчик · подразделение 7 · ID 101",
    );
    expect(employeeOptionLabel(employees[1], employees)).toBe(
      "Волкова Анна · Руководитель · подразделение 8 · ID 102",
    );
    expect(employeeOptionLabel(employees[2], employees)).toBe("Орлов Максим");
  });
});

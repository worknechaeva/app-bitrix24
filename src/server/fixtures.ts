import type { TaskPriority } from "@/integrations/bitrix24/contracts";

export type Project = {
  id: string;
  name: string;
  websiteUrl: string;
  bitrixGroupId: string;
  bitrixGroupName: string;
  requiredTag: string;
  defaultResponsibleId: string;
  defaultPriority: TaskPriority;
  timeTrackingEnabled: boolean;
  active: boolean;
};

export const EMPLOYEES = [
  { id: "101", name: "Анна Волкова", position: "Руководитель разработки", active: true },
  { id: "102", name: "Максим Орлов", position: "Frontend-разработчик", active: true },
  { id: "103", name: "Ирина Соколова", position: "Backend-разработчик", active: true },
] as const;

export const PROJECTS: Project[] = [
  {
    id: "technarost",
    name: "Технарост",
    websiteUrl: "https://technarost.ru",
    bitrixGroupId: "77",
    bitrixGroupName: "Разработка CMS",
    requiredTag: "technarost.ru",
    defaultResponsibleId: "101",
    defaultPriority: "medium",
    timeTrackingEnabled: true,
    active: true,
  },
  {
    id: "forma",
    name: "Форма",
    websiteUrl: "https://forma.example",
    bitrixGroupId: "77",
    bitrixGroupName: "Разработка CMS",
    requiredTag: "forma.example",
    defaultResponsibleId: "102",
    defaultPriority: "medium",
    timeTrackingEnabled: false,
    active: true,
  },
  {
    id: "archive",
    name: "Архивный проект",
    websiteUrl: "https://archive.example",
    bitrixGroupId: "77",
    bitrixGroupName: "Разработка CMS",
    requiredTag: "archive.example",
    defaultResponsibleId: "103",
    defaultPriority: "low",
    timeTrackingEnabled: false,
    active: false,
  },
];

export const SEEDED_SUBMISSIONS = [
  {
    id: "seed-1842",
    projectName: "Технарост",
    title: "Проверить форму обратной связи",
    responsibleName: "Анна Волкова",
    status: "success" as const,
    bitrixTaskId: "1842",
    createdAt: "2026-07-20T08:45:00.000Z",
  },
  {
    id: "seed-1839",
    projectName: "Форма",
    title: "Обновить текст на главной странице",
    responsibleName: "Максим Орлов",
    status: "success" as const,
    bitrixTaskId: "1839",
    createdAt: "2026-07-19T13:20:00.000Z",
  },
];

export const MOCK_USERS = [
  { id: "mock-admin", name: "Екатерина Нечаева", email: "admin@example.test", role: "admin" },
  { id: "mock-editor", name: "Алексей Редактор", email: "editor@example.test", role: "editor" },
] as const;

export function getEmployeeName(id: string) {
  return EMPLOYEES.find((employee) => employee.id === id)?.name ?? `Сотрудник #${id}`;
}

import type { Project } from "@/features/projects/schema";
import type { TaskStatus } from "@/features/tasks/task-status";

export const EMPLOYEES = [
  { id: "101", name: "Анна Волкова", position: "Руководитель разработки", active: true },
  { id: "102", name: "Максим Орлов", position: "Frontend-разработчик", active: true },
  { id: "103", name: "Ирина Соколова", position: "Backend-разработчик", active: true },
] as const;

export const TASK_ENTITIES = [
  { id: "77", title: "Разработка CMS", type: "project" as const },
  { id: "88", title: "Внутренние задачи", type: "group" as const },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: "technarost",
    name: "Технарост",
    websiteUrl: "https://technarost.ru",
    bitrixEntityId: "77",
    bitrixEntityTitle: "Разработка CMS",
    bitrixEntityType: "project",
    requiredTag: "technarost.ru",
    defaultResponsibleId: "101",
    ownerProfileId: "mock-admin",
    archived: false,
    canEdit: true,
    canArchive: true,
  },
  {
    id: "forma",
    name: "Форма",
    websiteUrl: "https://forma.example",
    bitrixEntityId: "77",
    bitrixEntityTitle: "Разработка CMS",
    bitrixEntityType: "project",
    requiredTag: "forma.example",
    defaultResponsibleId: "102",
    ownerProfileId: "mock-editor",
    archived: false,
    canEdit: true,
    canArchive: true,
  },
  {
    id: "archive",
    name: "Архивный проект",
    websiteUrl: "https://archive.example",
    bitrixEntityId: "77",
    bitrixEntityTitle: "Разработка CMS",
    bitrixEntityType: "project",
    requiredTag: "archive.example",
    defaultResponsibleId: "103",
    ownerProfileId: "mock-editor",
    archived: true,
    canEdit: true,
    canArchive: true,
  },
];

export const SEEDED_SUBMISSIONS = [
  {
    id: "seed-1842",
    projectName: "Технарост",
    title: "Проверить форму обратной связи",
    responsibleName: "Анна Волкова",
    projectId: "technarost",
    operationStatus: "success" as const,
    taskStatus: "in_progress" as TaskStatus,
    bitrixTaskId: "1842",
    createdAt: "2026-07-20T08:45:00.000Z",
  },
  {
    id: "seed-1839",
    projectName: "Форма",
    title: "Обновить текст на главной странице",
    responsibleName: "Максим Орлов",
    projectId: "forma",
    operationStatus: "success" as const,
    taskStatus: "completed" as TaskStatus,
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

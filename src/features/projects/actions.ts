"use server";

import { revalidatePath } from "next/cache";
import { projectFormSchema, type Project } from "./schema";
import { requireMockSession } from "@/server/auth/mock-session";
import { getProjectRepository } from "@/server/repositories/mock-project-repository";

export type ProjectActionResult =
  | { status: "success"; message: string; projects: Project[] }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> };

async function requireAdmin() {
  const session = await requireMockSession();
  return session.role === "admin";
}

export async function saveProjectAction(input: unknown): Promise<ProjectActionResult> {
  if (!(await requireAdmin()))
    return { status: "error", message: "Недостаточно прав для изменения проектов" };

  const parsed = projectFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте обязательные поля проекта",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const repository = getProjectRepository();
  const { id, ...values } = parsed.data;
  const project = id ? await repository.update(id, values) : await repository.create(values);
  if (!project) return { status: "error", message: "Проект не найден" };

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/tasks/new");
  return {
    status: "success",
    message: id ? "Проект сохранен" : "Проект добавлен",
    projects: await repository.listAll(),
  };
}

export async function setProjectActiveAction(id: string, active: boolean): Promise<ProjectActionResult> {
  if (!(await requireAdmin()))
    return { status: "error", message: "Недостаточно прав для изменения проектов" };
  const repository = getProjectRepository();
  const project = await repository.setActive(id, active);
  if (!project) return { status: "error", message: "Проект не найден" };

  revalidatePath("/");
  revalidatePath("/projects");
  revalidatePath("/tasks/new");
  return {
    status: "success",
    message: active ? "Проект снова активен" : "Проект выключен",
    projects: await repository.listAll(),
  };
}

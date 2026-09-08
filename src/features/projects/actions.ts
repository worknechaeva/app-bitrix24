"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Bitrix24DirectoryError } from "@/integrations/bitrix24/directory-errors";
import type { Bitrix24DirectoryClient } from "@/integrations/bitrix24/directory-client";
import { hashAppSessionToken } from "@/server/auth/app-session-service";
import { getLiveApplicationSessionAuthority } from "@/server/auth/application-session";
import { getMockSession } from "@/server/auth/mock-session";
import { getApplicationRuntimeMode } from "@/server/auth/runtime-mode";
import { createProductionBitrix24DirectoryClient } from "@/server/directory/production-directory";
import { EMPLOYEES, TASK_ENTITIES } from "@/server/fixtures";
import { getProjectRepository } from "@/server/repositories/mock-project-repository";
import type {
  LiveProjectRepository,
  ProjectRepository,
  VerifiedProjectInput,
} from "@/server/repositories/project-repository";
import { createSupabaseProjectRepository } from "@/server/repositories/supabase-project-repository";
import { projectFormSchema, type Project, type ProjectActor } from "./schema";

const directorySearchSchema = z
  .object({
    kind: z.enum(["entities", "employees"]),
    query: z
      .string()
      .trim()
      .max(120)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  })
  .strict();
const archiveInputSchema = z
  .object({ id: z.string().trim().min(1).max(128), archived: z.boolean() })
  .strict();
const saveProjectInputSchema = projectFormSchema
  .extend({ creationOperationKey: z.uuid().optional() })
  .superRefine((value, context) => {
    if (!value.id && !value.creationOperationKey) {
      context.addIssue({
        code: "custom",
        path: ["creationOperationKey"],
        message: "Не удалось начать создание проекта",
      });
    }
    if (value.id && value.creationOperationKey) {
      context.addIssue({
        code: "custom",
        path: ["creationOperationKey"],
        message: "Некорректная операция проекта",
      });
    }
  });

export type ProjectActionResult =
  | {
      status: "success";
      message: string;
      projects: Project[] | null;
      refreshRequired: boolean;
    }
  | {
      status: "error";
      message: string;
      code?: "reauth_required" | "save_result_unknown";
      fieldErrors?: Record<string, string[]>;
    };

type Context =
  | {
      mode: "mock";
      actor: ProjectActor;
      actorProfileId: string;
      repository: ProjectRepository;
      createDirectory: () => Bitrix24DirectoryClient;
    }
  | {
      mode: "live";
      actorProfileId: string;
      actorSessionTokenHash: string;
      repository: LiveProjectRepository;
      createDirectory: () => Bitrix24DirectoryClient;
    };

function mockDirectory(): Bitrix24DirectoryClient {
  return {
    async listTaskEntities({ query } = {}) {
      const q = query?.trim().toLocaleLowerCase("ru");
      return TASK_ENTITIES.filter((e) => !q || e.title.toLocaleLowerCase("ru").includes(q));
    },
    async listEmployees({ query } = {}) {
      const q = query?.trim().toLocaleLowerCase("ru");
      return EMPLOYEES.filter((e) => !q || e.name.toLocaleLowerCase("ru").includes(q)).map((e) => {
        const [name = "", lastName = ""] = e.name.split(" ");
        return { id: e.id, name, lastName, position: e.position, departmentIds: [] };
      });
    },
  };
}

async function getContext(): Promise<Context | null> {
  if (getApplicationRuntimeMode() === "mock") {
    const session = await getMockSession();
    if (!session) return null;
    return {
      mode: "mock",
      actor: { profileId: session.id, role: session.role === "admin" ? "administrator" : "editor" },
      actorProfileId: session.id,
      repository: getProjectRepository(),
      createDirectory: mockDirectory,
    };
  }
  const authority = await getLiveApplicationSessionAuthority();
  if (!authority) return null;
  const actor = {
    portalInstallationId: authority.actor.portalInstallationId,
    profileId: authority.actor.profileId,
  };
  return {
    mode: "live",
    actorProfileId: authority.actor.profileId,
    actorSessionTokenHash: hashAppSessionToken(authority.sessionToken),
    repository: createSupabaseProjectRepository(),
    createDirectory: () => createProductionBitrix24DirectoryClient(actor),
  };
}

async function list(context: Context) {
  return context.mode === "mock"
    ? context.repository.listVisible(context.actor)
    : context.repository.listVisible(context.actorSessionTokenHash);
}

export async function loadProjectPageData() {
  const context = await getContext();
  if (!context) return null;
  const projects = await list(context);
  let directoryStatus: "available" | "reauth_required" | "unavailable" = "available";
  let entities: Awaited<ReturnType<Bitrix24DirectoryClient["listTaskEntities"]>> = [];
  let employees: Awaited<ReturnType<Bitrix24DirectoryClient["listEmployees"]>> = [];
  try {
    const directory = context.createDirectory();
    [entities, employees] = await Promise.all([directory.listTaskEntities(), directory.listEmployees()]);
  } catch (error) {
    directoryStatus = isDirectoryReauthRequired(error) ? "reauth_required" : "unavailable";
  }
  return {
    projects,
    entities,
    employees,
    actorProfileId: context.actorProfileId,
    directoryStatus,
    mode: context.mode,
  };
}

export async function searchProjectDirectoryAction(kind: "entities" | "employees", query: string) {
  const parsed = directorySearchSchema.safeParse({ kind, query });
  if (!parsed.success) return { status: "error" as const, message: "Проверьте поисковый запрос" };
  const context = await getContext();
  if (!context) return { status: "error" as const, message: "Требуется вход" };
  try {
    const directory = context.createDirectory();
    const items =
      parsed.data.kind === "entities"
        ? await directory.listTaskEntities({ query: parsed.data.query })
        : await directory.listEmployees({ query: parsed.data.query });
    return { status: "success" as const, items };
  } catch (error) {
    return directoryFailure(error);
  }
}

export async function saveProjectAction(input: unknown): Promise<ProjectActionResult> {
  const parsed = saveProjectInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      status: "error",
      message: "Проверьте обязательные поля проекта",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  const context = await getContext();
  if (!context) return { status: "error", message: "Требуется повторный вход" };
  let verified: VerifiedProjectInput;
  try {
    const directory = context.createDirectory();
    const [entities, employees] = await Promise.all([
      directory.listTaskEntities(),
      directory.listEmployees(),
    ]);
    const entity = entities.find((item) => item.id === parsed.data.bitrixEntityId);
    const employee = employees.find((item) => item.id === parsed.data.defaultResponsibleId);
    if (!entity || !employee)
      return { status: "error", message: "Проект Bitrix24 или ответственный больше недоступен" };
    verified = {
      name: parsed.data.name,
      websiteUrl: parsed.data.websiteUrl,
      bitrixEntityId: entity.id,
      bitrixEntityType: entity.type,
      bitrixEntityTitle: entity.title,
      requiredTag: parsed.data.requiredTag,
      defaultResponsibleId: employee.id,
    };
  } catch (error) {
    return error instanceof Bitrix24DirectoryError
      ? directoryFailure(error)
      : { status: "error", message: "Справочник Bitrix24 временно недоступен" };
  }

  try {
    if (context.mode === "mock") {
      const result = parsed.data.id
        ? await context.repository.update(context.actor, parsed.data.id, verified)
        : await context.repository.create(context.actor, verified, parsed.data.creationOperationKey!);
      if (!result || ("outcome" in result && !["created", "unchanged"].includes(result.outcome)))
        return { status: "error", message: "Проект не найден или операция недоступна" };
    } else {
      const result = await context.repository.save(
        context.actorSessionTokenHash,
        parsed.data.id ?? null,
        verified,
        parsed.data.creationOperationKey ?? null,
      );
      const accepted = parsed.data.id
        ? result.outcome === "updated"
        : ["created", "unchanged"].includes(result.outcome);
      if (!accepted) return { status: "error", message: "Проект не найден или операция недоступна" };
    }
  } catch {
    return {
      status: "error",
      code: "save_result_unknown",
      message: "Не удалось получить результат сохранения. Проверьте список проектов перед повтором.",
    };
  }

  tryRevalidateProjects();
  return savedWithFreshList(context, parsed.data.id ? "Проект сохранен" : "Проект добавлен");
}

export async function reloadProjectListAction(): Promise<ProjectActionResult> {
  const context = await getContext();
  if (!context) return { status: "error", message: "Требуется повторный вход" };
  try {
    return {
      status: "success",
      message: "Список проектов обновлен",
      projects: await list(context),
      refreshRequired: false,
    };
  } catch {
    return { status: "error", message: "Не удалось обновить список проектов" };
  }
}

export async function setProjectArchivedAction(id: string, archived: boolean): Promise<ProjectActionResult> {
  const parsed = archiveInputSchema.safeParse({ id, archived });
  if (!parsed.success) return { status: "error", message: "Некорректный проект" };
  const context = await getContext();
  if (!context) return { status: "error", message: "Требуется повторный вход" };
  try {
    const result =
      context.mode === "mock"
        ? await context.repository.setArchived(context.actor, parsed.data.id, parsed.data.archived)
        : await context.repository.setArchived(
            context.actorSessionTokenHash,
            parsed.data.id,
            parsed.data.archived,
          );
    if (!["archived", "restored", "unchanged"].includes(result.outcome))
      return { status: "error", message: "Проект не найден или действие недоступно" };
    tryRevalidateProjects();
    return savedWithFreshList(
      context,
      parsed.data.archived ? "Проект перемещен в архив" : "Проект восстановлен",
    );
  } catch {
    return { status: "error", message: "Не удалось изменить проект" };
  }
}

async function savedWithFreshList(context: Context, message: string): Promise<ProjectActionResult> {
  try {
    return { status: "success", message, projects: await list(context), refreshRequired: false };
  } catch {
    return {
      status: "success",
      message: `${message}, но список не удалось обновить`,
      projects: null,
      refreshRequired: true,
    };
  }
}

function directoryFailure(error: unknown) {
  const reauth = isDirectoryReauthRequired(error);
  return {
    status: "error" as const,
    message: reauth
      ? "Сессия Bitrix24 истекла. Войдите повторно, чтобы продолжить."
      : "Справочник Bitrix24 временно недоступен",
    ...(reauth ? { code: "reauth_required" as const } : {}),
  };
}
function isDirectoryReauthRequired(error: unknown) {
  return (
    error instanceof Bitrix24DirectoryError &&
    ["unauthorized", "credentials_unavailable"].includes(error.code)
  );
}
function tryRevalidateProjects() {
  try {
    for (const path of ["/", "/projects", "/tasks/new", "/submissions"]) revalidatePath(path);
  } catch {
    // The confirmed database mutation must not become an ambiguous result because cache refresh failed.
  }
}

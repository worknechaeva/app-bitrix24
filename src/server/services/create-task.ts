import { Bitrix24Error } from "@/integrations/bitrix24/errors";
import { MockBitrix24Client, type MockScenario } from "@/integrations/bitrix24/mock-client";
import { getEmployeeName, SEEDED_SUBMISSIONS } from "@/server/fixtures";
import { taskCreateRequestSchema, type TaskCreateRequest } from "@/features/tasks/schema";
import type { TaskFileMetadata } from "@/features/tasks/files";
import type { TaskStatus } from "@/features/tasks/task-status";
import { getProjectRepository } from "@/server/repositories/mock-project-repository";

export type SubmissionStatus = "success" | "error" | "unknown";

export type SubmissionRecord = {
  id: string;
  idempotencyKey: string;
  projectId: string;
  projectName: string;
  title: string;
  responsibleName: string;
  deadline?: string;
  operationStatus: SubmissionStatus;
  taskStatus: TaskStatus;
  bitrixTaskId?: string;
  bitrixTaskUrl?: string;
  createdAt: string;
  message?: string;
  files: TaskFileMetadata[];
  requestPayloadSanitized: {
    title: string;
    description?: string;
    responsibleId: string;
    groupId: string;
    deadline?: string;
    tags: string[];
    files: TaskFileMetadata[];
  };
};

export type CreateTaskOutcome =
  | { status: "success"; submission: SubmissionRecord }
  | { status: "error"; message: string; fieldErrors?: Record<string, string[]> }
  | { status: "unknown"; submission: SubmissionRecord; message: string };

const submissions = new Map<string, SubmissionRecord>();
const pending = new Map<string, Promise<CreateTaskOutcome>>();

function parseTags(requiredTag: string, value: string) {
  const tags = [requiredTag, ...value.split(",")].map((tag) => tag.trim()).filter(Boolean);
  return [...new Map(tags.map((tag) => [tag.toLocaleLowerCase("ru"), tag])).values()];
}

function toDeadline(value: string) {
  return value ? `${value}T18:00:00+03:00` : undefined;
}

function validationErrors(error: ReturnType<typeof taskCreateRequestSchema.safeParse>) {
  if (error.success) return undefined;
  return error.error.flatten().fieldErrors as Record<string, string[]>;
}

export async function createTask(input: TaskCreateRequest): Promise<CreateTaskOutcome> {
  const parsed = taskCreateRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Проверьте заполненные поля", fieldErrors: validationErrors(parsed) };
  }

  const existing = submissions.get(parsed.data.idempotencyKey);
  if (existing) {
    return existing.operationStatus === "unknown"
      ? { status: "unknown", submission: existing, message: existing.message ?? "Статус неизвестен" }
      : { status: "success", submission: existing };
  }

  const inFlight = pending.get(parsed.data.idempotencyKey);
  if (inFlight) return inFlight;

  const operation = executeCreate(parsed.data);
  pending.set(parsed.data.idempotencyKey, operation);
  try {
    return await operation;
  } finally {
    pending.delete(parsed.data.idempotencyKey);
  }
}

async function executeCreate(data: TaskCreateRequest): Promise<CreateTaskOutcome> {
  const project = await getProjectRepository().findById(data.projectId);
  if (project && !project.active) return { status: "error", message: "Выбранный проект недоступен" };
  if (!project) return { status: "error", message: "Выбранный проект недоступен" };

  const responsibleId =
    data.responsibleId === "default" || !data.responsibleId
      ? project.defaultResponsibleId
      : data.responsibleId;
  const client = new MockBitrix24Client(data.mockScenario as MockScenario);
  const sanitizedPayload = {
    title: data.title.trim(),
    description: data.description.trim() || undefined,
    responsibleId,
    groupId: project.bitrixGroupId,
    deadline: toDeadline(data.deadline),
    tags: parseTags(project.requiredTag, data.additionalTags),
    files: data.files.map((file) => ({ ...file })),
  };

  try {
    const result = await client.createTask({
      idempotencyKey: data.idempotencyKey,
      title: sanitizedPayload.title,
      description: sanitizedPayload.description,
      responsibleId: sanitizedPayload.responsibleId,
      groupId: sanitizedPayload.groupId,
      deadline: sanitizedPayload.deadline,
      tags: sanitizedPayload.tags,
    });
    const submission: SubmissionRecord = {
      id: crypto.randomUUID(),
      idempotencyKey: data.idempotencyKey,
      projectId: project.id,
      projectName: project.name,
      title: result.title,
      responsibleName: getEmployeeName(result.responsibleId),
      deadline: data.deadline || undefined,
      operationStatus: "success",
      taskStatus: "new",
      bitrixTaskId: result.id,
      bitrixTaskUrl: result.url,
      createdAt: new Date().toISOString(),
      files: data.files.map((file) => ({ ...file })),
      requestPayloadSanitized: sanitizedPayload,
    };
    submissions.set(data.idempotencyKey, submission);
    return { status: "success", submission };
  } catch (error) {
    if (error instanceof Bitrix24Error && error.code === "BITRIX_TIMEOUT") {
      const submission: SubmissionRecord = {
        id: crypto.randomUUID(),
        idempotencyKey: data.idempotencyKey,
        projectId: project.id,
        projectName: project.name,
        title: data.title.trim(),
        responsibleName: getEmployeeName(responsibleId),
        deadline: data.deadline || undefined,
        operationStatus: "unknown",
        taskStatus: "unknown",
        createdAt: new Date().toISOString(),
        message: "Bitrix24 не ответил вовремя. Не отправляйте задачу повторно, пока не проверите портал.",
        files: data.files.map((file) => ({ ...file })),
        requestPayloadSanitized: sanitizedPayload,
      };
      submissions.set(data.idempotencyKey, submission);
      return { status: "unknown", submission, message: submission.message! };
    }
    return { status: "error", message: "Не удалось создать задачу. Попробуйте позже." };
  }
}

export function listSubmissions(): SubmissionRecord[] {
  return [
    ...Array.from(submissions.values()),
    ...SEEDED_SUBMISSIONS.map((item) => ({
      ...item,
      idempotencyKey: item.id,
      files: [],
      requestPayloadSanitized: {
        title: item.title,
        responsibleId: "mock",
        groupId: "77",
        tags: [],
        files: [],
      },
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function clearRuntimeSubmissions() {
  submissions.clear();
  pending.clear();
}

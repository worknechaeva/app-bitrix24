import { Bitrix24Error } from "@/integrations/bitrix24/errors";
import { MockBitrix24Client, type MockScenario } from "@/integrations/bitrix24/mock-client";
import type { TaskPriority } from "@/integrations/bitrix24/contracts";
import { getEmployeeName, PROJECTS, SEEDED_SUBMISSIONS } from "@/server/fixtures";
import { taskFormSchema, type TaskFormValues } from "@/features/tasks/schema";

export type SubmissionStatus = "success" | "error" | "unknown";

export type SubmissionRecord = {
  id: string;
  idempotencyKey: string;
  projectName: string;
  title: string;
  responsibleName: string;
  deadline?: string;
  status: SubmissionStatus;
  bitrixTaskId?: string;
  bitrixTaskUrl?: string;
  createdAt: string;
  message?: string;
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

function validationErrors(error: ReturnType<typeof taskFormSchema.safeParse>) {
  if (error.success) return undefined;
  return error.error.flatten().fieldErrors as Record<string, string[]>;
}

export async function createTask(input: TaskFormValues): Promise<CreateTaskOutcome> {
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Проверьте заполненные поля", fieldErrors: validationErrors(parsed) };
  }

  const existing = submissions.get(parsed.data.idempotencyKey);
  if (existing) {
    return existing.status === "unknown"
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

async function executeCreate(data: TaskFormValues): Promise<CreateTaskOutcome> {
  const project = PROJECTS.find((item) => item.id === data.projectId && item.active);
  if (!project) return { status: "error", message: "Выбранный проект недоступен" };

  const responsibleId =
    data.responsibleId === "default" || !data.responsibleId
      ? project.defaultResponsibleId
      : data.responsibleId;
  const priority = (data.priority === "default" ? project.defaultPriority : data.priority) as TaskPriority;
  const estimateSeconds = data.estimateHours
    ? Math.round(Number(data.estimateHours.replace(",", ".")) * 3600)
    : undefined;
  const client = new MockBitrix24Client(data.mockScenario as MockScenario);

  try {
    const result = await client.createTask({
      idempotencyKey: data.idempotencyKey,
      title: data.title.trim(),
      description: data.description.trim() || undefined,
      responsibleId,
      groupId: project.bitrixGroupId,
      deadline: toDeadline(data.deadline),
      priority,
      estimateSeconds,
      tags: parseTags(project.requiredTag, data.additionalTags),
      allowTimeTracking: project.timeTrackingEnabled,
    });
    const submission: SubmissionRecord = {
      id: crypto.randomUUID(),
      idempotencyKey: data.idempotencyKey,
      projectName: project.name,
      title: result.title,
      responsibleName: getEmployeeName(result.responsibleId),
      deadline: data.deadline || undefined,
      status: "success",
      bitrixTaskId: result.id,
      bitrixTaskUrl: result.url,
      createdAt: new Date().toISOString(),
    };
    submissions.set(data.idempotencyKey, submission);
    return { status: "success", submission };
  } catch (error) {
    if (error instanceof Bitrix24Error && error.code === "BITRIX_TIMEOUT") {
      const submission: SubmissionRecord = {
        id: crypto.randomUUID(),
        idempotencyKey: data.idempotencyKey,
        projectName: project.name,
        title: data.title.trim(),
        responsibleName: getEmployeeName(responsibleId),
        deadline: data.deadline || undefined,
        status: "unknown",
        createdAt: new Date().toISOString(),
        message: "Bitrix24 не ответил вовремя. Не отправляйте задачу повторно, пока не проверите портал.",
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
    ...SEEDED_SUBMISSIONS.map((item) => ({ ...item, idempotencyKey: item.id })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function clearRuntimeSubmissions() {
  submissions.clear();
  pending.clear();
}

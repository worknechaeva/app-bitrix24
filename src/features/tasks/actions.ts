"use server";

import { createTask, type CreateTaskOutcome } from "@/server/services/create-task";
import { requireMockSession } from "@/server/auth/mock-session";
import { taskFileStore, TaskFileValidationError } from "@/server/files/task-file-store";
import { taskCreateRequestSchema } from "./schema";

export async function createTaskAction(formData: FormData): Promise<CreateTaskOutcome> {
  await requireMockSession();
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  let metadata;
  try {
    metadata = await taskFileStore.prepare(files);
  } catch (error) {
    if (error instanceof TaskFileValidationError) {
      return { status: "error", message: error.message, fieldErrors: { files: [error.message] } };
    }
    return { status: "error", message: "Не удалось проверить прикрепленные файлы" };
  }

  const parsed = taskCreateRequestSchema.safeParse({
    idempotencyKey: formData.get("idempotencyKey"),
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    responsibleId: formData.get("responsibleId"),
    deadline: formData.get("deadline"),
    description: formData.get("description"),
    additionalTags: formData.get("additionalTags"),
    mockScenario: formData.get("mockScenario"),
    files: metadata,
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте заполненные поля",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  return createTask(parsed.data);
}

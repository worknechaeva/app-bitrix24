"use server";

import { createTask, type CreateTaskOutcome } from "@/server/services/create-task";
import { requireMockSession } from "@/server/auth/mock-session";
import { taskFormSchema } from "./schema";

export async function createTaskAction(input: unknown): Promise<CreateTaskOutcome> {
  await requireMockSession();
  const parsed = taskFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Проверьте заполненные поля",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  return createTask(parsed.data);
}

import { beforeEach, describe, expect, it } from "vitest";
import { clearRuntimeSubmissions, createTask } from "@/server/services/create-task";
import type { TaskFormValues } from "@/features/tasks/schema";

function input(overrides: Partial<TaskFormValues> = {}): TaskFormValues {
  return {
    idempotencyKey: crypto.randomUUID(),
    projectId: "technarost",
    title: "Исправить форму",
    responsibleId: "default",
    deadline: "2026-07-25",
    description: "Описание",
    priority: "default",
    estimateHours: "1,5",
    additionalTags: "срочно, technarost.ru",
    mockScenario: "success",
    ...overrides,
  };
}

describe("createTask service", () => {
  beforeEach(() => clearRuntimeSubmissions());

  it("returns the same successful task for duplicate requests", async () => {
    const values = input();
    const [first, duplicate] = await Promise.all([createTask(values), createTask(values)]);
    expect(first.status).toBe("success");
    expect(duplicate).toEqual(first);
  });

  it("does not retry an unknown timeout", async () => {
    const values = input({ mockScenario: "timeout" });
    const first = await createTask(values);
    const duplicate = await createTask(values);
    expect(first.status).toBe("unknown");
    expect(duplicate.status).toBe("unknown");
    expect(duplicate).toEqual(first);
  });

  it("returns a safe message for an integration error", async () => {
    const result = await createTask(input({ mockScenario: "error" }));
    expect(result).toEqual({ status: "error", message: "Не удалось создать задачу. Попробуйте позже." });
  });
});

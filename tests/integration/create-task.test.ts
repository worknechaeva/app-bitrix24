import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRuntimeSubmissions, createTask } from "@/server/services/create-task";
import type { TaskCreateRequest } from "@/features/tasks/schema";

function input(overrides: Partial<TaskCreateRequest> = {}): TaskCreateRequest {
  return {
    idempotencyKey: crypto.randomUUID(),
    projectId: "technarost",
    title: "Исправить форму",
    responsibleId: "default",
    deadline: "2026-07-25",
    description: "Описание",
    additionalTags: "срочно, technarost.ru",
    mockScenario: "success",
    files: [],
    ...overrides,
  };
}

describe("createTask service", () => {
  beforeEach(() => clearRuntimeSubmissions());
  afterEach(() => vi.unstubAllEnvs());

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

  it("allows a conscious retry with a new idempotency key", async () => {
    const first = await createTask(input({ mockScenario: "timeout" }));
    const retry = await createTask(input({ idempotencyKey: crypto.randomUUID(), mockScenario: "success" }));
    expect(first.status).toBe("unknown");
    expect(retry.status).toBe("success");
  });

  it("omits an empty deadline and keeps only safe file metadata", async () => {
    const result = await createTask(
      input({
        deadline: "",
        files: [{ name: "brief.pdf", size: 2048, type: "application/pdf" }],
      }),
    );
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.submission.deadline).toBeUndefined();
    expect(result.submission.requestPayloadSanitized.deadline).toBeUndefined();
    expect(result.submission.requestPayloadSanitized.files).toEqual([
      { name: "brief.pdf", size: 2048, type: "application/pdf" },
    ]);
    expect(result.submission.requestPayloadSanitized).not.toHaveProperty("priority");
    expect(result.submission.requestPayloadSanitized).not.toHaveProperty("estimateSeconds");
    expect(result.submission.requestPayloadSanitized).not.toHaveProperty("allowTimeTracking");
  });

  it("returns a safe message for an integration error", async () => {
    const result = await createTask(input({ mockScenario: "error" }));
    expect(result).toEqual({ status: "error", message: "Не удалось создать задачу. Попробуйте позже." });
  });

  it("fails closed in production even when user input asks for mock success", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const untrustedInput = {
      ...input({ mockScenario: "success" }),
      runtimeMode: "development",
    } as TaskCreateRequest;
    const result = await createTask(untrustedInput);

    expect(result).toEqual({
      status: "error",
      code: "task_creation_disabled",
      message: "Создание задач временно недоступно. Попробуйте позже.",
    });
    expect(result.status).not.toBe("success");
    expect(result).not.toHaveProperty("submission");
    expect(result).not.toHaveProperty("bitrixTaskId");
  });
});

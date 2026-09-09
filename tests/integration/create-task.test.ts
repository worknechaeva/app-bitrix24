import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRuntimeSubmissions, createTask, listSubmissions } from "@/server/services/create-task";
import type { TaskCreateRequest } from "@/features/tasks/schema";

const administrator = { profileId: "mock-admin", role: "administrator" as const };
const editor = { profileId: "mock-editor", role: "editor" as const };
const secondEditor = { profileId: "mock-editor-2", role: "editor" as const };

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
    const [first, duplicate] = await Promise.all([
      createTask(values, administrator),
      createTask(values, administrator),
    ]);
    expect(first.status).toBe("success");
    expect(duplicate).toEqual(first);
  });

  it("does not retry an unknown timeout", async () => {
    const values = input({ mockScenario: "timeout" });
    const first = await createTask(values, administrator);
    const duplicate = await createTask(values, administrator);
    expect(first.status).toBe("unknown");
    expect(duplicate.status).toBe("unknown");
    expect(duplicate).toEqual(first);
  });

  it("allows a conscious retry with a new idempotency key", async () => {
    const first = await createTask(input({ mockScenario: "timeout" }), administrator);
    const retry = await createTask(
      input({ idempotencyKey: crypto.randomUUID(), mockScenario: "success" }),
      administrator,
    );
    expect(first.status).toBe("unknown");
    expect(retry.status).toBe("success");
  });

  it("omits an empty deadline and keeps only safe file metadata", async () => {
    const result = await createTask(
      input({
        deadline: "",
        files: [{ name: "brief.pdf", size: 2048, type: "application/pdf" }],
      }),
      administrator,
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
    const result = await createTask(input({ mockScenario: "error" }), administrator);
    expect(result).toEqual({ status: "error", message: "Не удалось создать задачу. Попробуйте позже." });
  });

  it("fails closed in production even when user input asks for mock success", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const untrustedInput = {
      ...input({ mockScenario: "success" }),
      runtimeMode: "development",
    } as TaskCreateRequest;
    const result = await createTask(untrustedInput, administrator);

    expect(result).toEqual({
      status: "error",
      code: "task_creation_disabled",
      message: "Создание задач временно недоступно. Попробуйте позже.",
    });
    expect(result.status).not.toBe("success");
    expect(result).not.toHaveProperty("submission");
    expect(result).not.toHaveProperty("bitrixTaskId");
  });

  it("does not disclose a cached or in-flight submission to another actor", async () => {
    const completedInput = input();
    expect((await createTask(completedInput, administrator)).status).toBe("success");
    await expect(createTask(completedInput, editor)).resolves.toEqual({
      status: "error",
      message: "Не удалось создать задачу. Попробуйте позже.",
    });

    const inFlightInput = input();
    const [ownerResult, otherResult] = await Promise.all([
      createTask(inFlightInput, administrator),
      createTask(inFlightInput, editor),
    ]);
    expect(ownerResult.status).toBe("success");
    expect(otherResult).toEqual({
      status: "error",
      message: "Не удалось создать задачу. Попробуйте позже.",
    });
  });

  it("lists seeded and concurrent runtime submissions only for their attempt actor", async () => {
    const [administratorResult, editorResult] = await Promise.all([
      createTask(input({ title: "Runtime администратора" }), administrator),
      createTask(
        input({
          projectId: "forma",
          title: "Runtime редактора с неизвестным статусом",
          mockScenario: "timeout",
        }),
        editor,
      ),
    ]);
    expect(administratorResult.status).toBe("success");
    expect(editorResult.status).toBe("unknown");

    const editorHistory = listSubmissions(editor);
    expect(editorHistory.map(({ title }) => title)).toEqual(
      expect.arrayContaining([
        "Runtime редактора с неизвестным статусом",
        "Обновить текст на главной странице",
      ]),
    );
    expect(editorHistory.map(({ title }) => title)).not.toContain("Runtime администратора");
    expect(editorHistory.map(({ title }) => title)).not.toContain("Проверить форму обратной связи");

    const secondEditorHistory = listSubmissions(secondEditor);
    expect(secondEditorHistory).toHaveLength(1);
    expect(secondEditorHistory[0]).toMatchObject({
      title: "Проверить неизвестный результат отправки",
      projectId: "technarost",
      operationStatus: "unknown",
    });

    const administratorHistory = listSubmissions(administrator);
    expect(administratorHistory.map(({ title }) => title)).toEqual(
      expect.arrayContaining([
        "Runtime администратора",
        "Runtime редактора с неизвестным статусом",
        "Проверить форму обратной связи",
        "Обновить текст на главной странице",
        "Проверить неизвестный результат отправки",
      ]),
    );
    expect(
      administratorHistory
        .map(({ createdAt }) => createdAt)
        .toSorted()
        .toReversed(),
    ).toEqual(administratorHistory.map(({ createdAt }) => createdAt));
  });

  it("shares actor-bound runtime history across isolated server module instances", async () => {
    const firstModule = await import("@/server/services/create-task");
    const result = await firstModule.createTask(
      input({ projectId: "forma", title: "Runtime между server bundles" }),
      editor,
    );
    expect(result.status).toBe("success");

    vi.resetModules();
    const reloadedModule = await import("@/server/services/create-task");
    expect(reloadedModule.listSubmissions(editor).map(({ title }) => title)).toContain(
      "Runtime между server bundles",
    );
    expect(reloadedModule.listSubmissions(secondEditor).map(({ title }) => title)).not.toContain(
      "Runtime между server bundles",
    );
  });
});

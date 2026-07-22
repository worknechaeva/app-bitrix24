import { afterEach, describe, expect, it, vi } from "vitest";
import { getBitrix24TaskClient } from "@/integrations/bitrix24/composition-root";
import { DisabledBitrix24TaskClient } from "@/integrations/bitrix24/disabled-task-client";
import { Bitrix24Error } from "@/integrations/bitrix24/errors";
import { MockBitrix24TaskClient } from "@/integrations/bitrix24/mock-task-client";

const input = {
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  title: "Тестовая задача",
  responsibleId: "101",
  groupId: "77",
  tags: ["technarost.ru"],
};

const removedFields = [
  "priority",
  "defaultPriority",
  "estimateHours",
  "estimateSeconds",
  "allowTimeTracking",
  "timeTrackingEnabled",
  "PRIORITY",
  "TIME_ESTIMATE",
  "ALLOW_TIME_TRACKING",
];

describe("Bitrix24 task client composition", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["development", "test"] as const)("selects the mock client in %s", (runtime) => {
    vi.stubEnv("NODE_ENV", runtime);
    expect(getBitrix24TaskClient("success")).toBeInstanceOf(MockBitrix24TaskClient);
  });

  it("selects the disabled client in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getBitrix24TaskClient("success")).toBeInstanceOf(DisabledBitrix24TaskClient);
  });

  it("does not change task composition when the OAuth spike flag is enabled", () => {
    vi.stubEnv("BITRIX24_OAUTH_SPIKE_ENABLED", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(getBitrix24TaskClient("success")).toBeInstanceOf(MockBitrix24TaskClient);

    vi.stubEnv("NODE_ENV", "production");
    expect(getBitrix24TaskClient("success")).toBeInstanceOf(DisabledBitrix24TaskClient);
  });

  it("fails closed in production without a task id or provider data", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const result = await getBitrix24TaskClient("success").createTask(input);

    expect(result).toEqual({ status: "error", code: "task_creation_disabled" });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("task");
    expect(result).not.toHaveProperty("rawResponse");
  });
});

describe("MockBitrix24TaskClient", () => {
  it("returns a deterministic task id without removed fields", async () => {
    const client = new MockBitrix24TaskClient("success");
    const first = await client.createTask(input);
    const second = await client.createTask(input);

    expect(first.status).toBe("success");
    expect(second).toEqual(first);
    if (first.status !== "success") return;
    expect(first.task.url).toContain(first.task.id);
    expect(Object.keys(input)).not.toEqual(expect.arrayContaining(removedFields));
    expect(Object.keys(first.task)).not.toEqual(expect.arrayContaining(removedFields));
  });

  it("exposes a normalized timeout", async () => {
    const client = new MockBitrix24TaskClient("timeout");
    await expect(client.createTask(input)).rejects.toMatchObject({
      code: "BITRIX_TIMEOUT",
    } satisfies Partial<Bitrix24Error>);
  });
});

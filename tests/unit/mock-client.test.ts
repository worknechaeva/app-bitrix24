import { describe, expect, it } from "vitest";
import { MockBitrix24Client } from "@/integrations/bitrix24/mock-client";
import { Bitrix24Error } from "@/integrations/bitrix24/errors";

const input = {
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  title: "Тестовая задача",
  responsibleId: "101",
  groupId: "77",
  priority: "medium" as const,
  tags: ["technarost.ru"],
  allowTimeTracking: true,
};

describe("MockBitrix24Client", () => {
  it("returns a deterministic task id", async () => {
    const client = new MockBitrix24Client("success");
    const first = await client.createTask(input);
    const second = await client.createTask(input);
    expect(first.id).toBe(second.id);
    expect(first.url).toContain(first.id);
  });

  it("exposes a normalized timeout", async () => {
    const client = new MockBitrix24Client("timeout");
    await expect(client.createTask(input)).rejects.toMatchObject({
      code: "BITRIX_TIMEOUT",
    } satisfies Partial<Bitrix24Error>);
  });
});

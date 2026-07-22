import "server-only";

import type { Bitrix24TaskClient, CreateBitrixTaskInput, CreateBitrixTaskResult } from "./task-client";
import { Bitrix24Error } from "./errors";

export type MockScenario = "success" | "error" | "timeout";

function deterministicTaskId(idempotencyKey: string) {
  const value = idempotencyKey.replaceAll("-", "").slice(0, 7);
  return String(2000 + (Number.parseInt(value, 16) % 7000));
}

export class MockBitrix24TaskClient implements Bitrix24TaskClient {
  constructor(private readonly scenario: MockScenario = "success") {}

  async createTask(input: CreateBitrixTaskInput): Promise<CreateBitrixTaskResult> {
    await new Promise((resolve) => setTimeout(resolve, this.scenario === "timeout" ? 350 : 120));

    if (this.scenario === "timeout") {
      throw new Bitrix24Error("BITRIX_TIMEOUT", "Ответ Bitrix24 не получен вовремя");
    }

    if (this.scenario === "error") {
      throw new Bitrix24Error("BITRIX_UNAVAILABLE", "Bitrix24 временно недоступен");
    }

    const id = deterministicTaskId(input.idempotencyKey);
    return {
      status: "success",
      task: {
        id,
        title: input.title,
        responsibleId: input.responsibleId,
        deadline: input.deadline,
        url: `https://example.bitrix24.test/tasks/task/view/${id}/`,
      },
    };
  }
}

import type {
  Bitrix24Client,
  BitrixUser,
  BitrixWorkgroup,
  ConnectionStatus,
  CreateBitrixTaskInput,
  CreateBitrixTaskResult,
} from "./contracts";
import { Bitrix24Error } from "./errors";
import { EMPLOYEES } from "@/server/fixtures";

export type MockScenario = "success" | "error" | "timeout";

function deterministicTaskId(idempotencyKey: string) {
  const value = idempotencyKey.replaceAll("-", "").slice(0, 7);
  return String(2000 + (Number.parseInt(value, 16) % 7000));
}

export class MockBitrix24Client implements Bitrix24Client {
  constructor(private readonly scenario: MockScenario = "success") {}

  async checkConnection(): Promise<ConnectionStatus> {
    return {
      connected: true,
      mode: "mock",
      accountName: "Демо-портал Bitrix24",
      checkedAt: new Date().toISOString(),
    };
  }

  async getCurrentUser(): Promise<BitrixUser> {
    return { id: "1", name: "Webhook Demo", position: "Интеграция", active: true };
  }

  async listEmployees(): Promise<BitrixUser[]> {
    return EMPLOYEES.map((employee) => ({ ...employee }));
  }

  async listWorkgroups(): Promise<BitrixWorkgroup[]> {
    return [{ id: "77", name: "Разработка CMS", active: true }];
  }

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
      id,
      title: input.title,
      responsibleId: input.responsibleId,
      deadline: input.deadline,
      url: `https://example.bitrix24.test/tasks/task/view/${id}/`,
    };
  }
}

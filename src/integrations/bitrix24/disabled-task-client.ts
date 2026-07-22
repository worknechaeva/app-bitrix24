import "server-only";

import type { Bitrix24TaskClient, CreateBitrixTaskInput, CreateBitrixTaskResult } from "./task-client";

export class DisabledBitrix24TaskClient implements Bitrix24TaskClient {
  async createTask(input: CreateBitrixTaskInput): Promise<CreateBitrixTaskResult> {
    void input;
    return { status: "error", code: "task_creation_disabled" };
  }
}

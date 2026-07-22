import "server-only";

import { DisabledBitrix24TaskClient } from "./disabled-task-client";
import { MockBitrix24TaskClient, type MockScenario } from "./mock-task-client";
import type { Bitrix24TaskClient } from "./task-client";
import { getServerRuntime } from "@/lib/env/server";

type ServerRuntime = "development" | "test" | "production";

function createBitrix24TaskClient(
  runtime: ServerRuntime,
  mockScenario: MockScenario = "success",
): Bitrix24TaskClient {
  if (runtime === "production") return new DisabledBitrix24TaskClient();
  return new MockBitrix24TaskClient(mockScenario);
}

export function getBitrix24TaskClient(mockScenario: MockScenario): Bitrix24TaskClient {
  return createBitrix24TaskClient(getServerRuntime(), mockScenario);
}

import { describe, expect, it } from "vitest";
import { mapBitrixTaskStatus, TASK_STATUS_LABELS } from "@/features/tasks/task-status";

describe("task status domain mapping", () => {
  it("maps known external values to internal statuses", () => {
    expect(mapBitrixTaskStatus("2")).toBe("new");
    expect(mapBitrixTaskStatus("3")).toBe("in_progress");
    expect(mapBitrixTaskStatus(5)).toBe("completed");
    expect(mapBitrixTaskStatus("unexpected")).toBe("unknown");
  });

  it("provides Russian labels independently from fixtures", () => {
    expect(TASK_STATUS_LABELS).toEqual({
      new: "Новая",
      in_progress: "В работе",
      completed: "Завершена",
      unknown: "Неизвестно",
    });
  });
});

import { describe, expect, it } from "vitest";
import { taskFormSchema } from "@/features/tasks/schema";

const validInput = {
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  projectId: "technarost",
  title: "Проверить форму",
  responsibleId: "default",
  deadline: "",
  description: "",
  additionalTags: "контент, срочно",
  mockScenario: "success" as const,
};

describe("taskFormSchema", () => {
  it("accepts a valid Russian task form", () => {
    expect(taskFormSchema.safeParse(validInput).success).toBe(true);
  });

  it("requires a project and a title", () => {
    const result = taskFormSchema.safeParse({ ...validInput, projectId: "", title: "" });
    expect(result.success).toBe(false);
  });

  it("accepts an empty deadline and rejects an invalid date", () => {
    expect(taskFormSchema.safeParse({ ...validInput, deadline: "" }).success).toBe(true);
    expect(taskFormSchema.safeParse({ ...validInput, deadline: "сегодня" }).success).toBe(false);
  });

  it("does not contain removed task fields", () => {
    expect(Object.keys(taskFormSchema.shape)).not.toEqual(
      expect.arrayContaining([
        "priority",
        "defaultPriority",
        "estimateHours",
        "estimateSeconds",
        "allowTimeTracking",
        "timeTrackingEnabled",
        "PRIORITY",
        "TIME_ESTIMATE",
        "ALLOW_TIME_TRACKING",
      ]),
    );
  });
});

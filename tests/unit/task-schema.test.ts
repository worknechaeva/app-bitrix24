import { describe, expect, it } from "vitest";
import { taskFormSchema } from "@/features/tasks/schema";

const validInput = {
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  projectId: "technarost",
  title: "Проверить форму",
  responsibleId: "default",
  deadline: "",
  description: "",
  priority: "default" as const,
  estimateHours: "1,5",
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

  it("accepts only quarter-hour estimates", () => {
    expect(taskFormSchema.safeParse({ ...validInput, estimateHours: "1,3" }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...validInput, estimateHours: "1,25" }).success).toBe(true);
  });
});

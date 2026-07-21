import { describe, expect, it } from "vitest";
import { MockProjectRepository } from "@/server/repositories/mock-project-repository";

describe("MockProjectRepository", () => {
  it("creates, updates and toggles a project", async () => {
    const repository = new MockProjectRepository([]);
    const created = await repository.create({
      name: "Новый сайт",
      websiteUrl: "https://new.example",
      bitrixGroupId: "55",
      bitrixGroupName: "Новая группа",
      requiredTag: "new.example",
      defaultResponsibleId: "101",
      active: true,
    });
    expect((await repository.listActive()).map((project) => project.name)).toEqual(["Новый сайт"]);

    const updated = await repository.update(created.id, { ...created, name: "Обновленный сайт" });
    expect(updated?.name).toBe("Обновленный сайт");
    await repository.setActive(created.id, false);
    expect(await repository.listActive()).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { MockProjectRepository } from "@/server/repositories/mock-project-repository";
import { projectFormSchema } from "@/features/projects/schema";
const editor = { profileId: "editor", role: "editor" as const };
const admin = { profileId: "admin", role: "administrator" as const };
const input = {
  name: "Новый сайт",
  websiteUrl: "https://new.example",
  bitrixEntityId: "55",
  bitrixEntityType: "project" as const,
  bitrixEntityTitle: "Новая группа",
  requiredTag: "new.example",
  defaultResponsibleId: "101",
};
describe("MockProjectRepository", () => {
  it("accepts only HTTP project websites", () => {
    const form = {
      name: input.name,
      bitrixEntityId: input.bitrixEntityId,
      requiredTag: input.requiredTag,
      defaultResponsibleId: input.defaultResponsibleId,
    };
    expect(projectFormSchema.safeParse({ ...form, websiteUrl: "ftp://project.example" }).success).toBe(false);
    expect(projectFormSchema.safeParse({ ...form, websiteUrl: "https://project.example" }).success).toBe(
      true,
    );
  });
  it("isolates owners and writes archive audit once", async () => {
    const repository = new MockProjectRepository([]);
    const operationKey = "11111111-1111-4111-8111-111111111111";
    const created = await repository.create(editor, input, operationKey);
    expect(created.outcome).toBe("created");
    const replayed = await repository.create(editor, input, operationKey);
    expect(replayed).toEqual({ outcome: "unchanged", projectId: created.projectId });
    expect(await repository.create(editor, { ...input, name: "Другой проект" }, operationKey)).toEqual({
      outcome: "forbidden",
      projectId: created.projectId,
    });
    expect((await repository.listVisible(editor)).map((project) => project.name)).toEqual(["Новый сайт"]);
    expect(await repository.listVisible(admin)).toHaveLength(1);
    expect(
      await repository.update(admin, created.projectId!, { ...input, name: "Чужое изменение" }),
    ).toBeUndefined();
    expect((await repository.setArchived(admin, created.projectId!, true)).outcome).toBe("archived");
    expect((await repository.setArchived(admin, created.projectId!, true)).outcome).toBe("unchanged");
    expect(repository.listAuditEvents()).toHaveLength(1);
    expect((await repository.findAccessible(editor, created.projectId!))?.archived).toBe(true);
  });
});

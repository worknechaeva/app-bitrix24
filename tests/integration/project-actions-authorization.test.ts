import { beforeEach, describe, expect, it, vi } from "vitest";
const mockSession = vi.hoisted(() => ({ role: "editor" as "admin" | "editor" }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "task-launcher-mock-role" ? { value: mockSession.role } : undefined),
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
import { saveProjectAction, setProjectArchivedAction } from "@/features/projects/actions";
import { getProjectRepository, resetMockProjects } from "@/server/repositories/mock-project-repository";
const input = {
  name: "Проект проверки прав",
  websiteUrl: "https://authorization.example",
  bitrixEntityId: "77",
  requiredTag: "authorization.example",
  defaultResponsibleId: "101",
};
const createInput = { ...input, creationOperationKey: "11111111-1111-4111-8111-111111111111" };
const editor = { profileId: "mock-editor", role: "editor" as const };
const admin = { profileId: "mock-admin", role: "administrator" as const };
describe("project Server Action authorization", () => {
  beforeEach(() => {
    resetMockProjects();
    mockSession.role = "editor";
    revalidatePath.mockClear();
  });
  it("allows an editor to manage own projects but not an administrator project", async () => {
    expect((await saveProjectAction(createInput)).status).toBe("success");
    const repository = getProjectRepository();
    const own = (await repository.listVisible(editor)).find((p) => p.name === input.name)!;
    expect((await saveProjectAction({ ...input, id: own.id, name: "Своя настройка" })).status).toBe(
      "success",
    );
    expect((await saveProjectAction({ ...input, id: "technarost" })).status).toBe("error");
    expect((await setProjectArchivedAction("technarost", true)).status).toBe("error");
  });

  it("rejects entity and employee identifiers that Directory did not verify", async () => {
    const repository = getProjectRepository();
    const before = await repository.listVisible(editor);
    expect((await saveProjectAction({ ...createInput, bitrixEntityId: "999" })).status).toBe("error");
    expect((await saveProjectAction({ ...createInput, defaultResponsibleId: "999" })).status).toBe("error");
    expect(await repository.listVisible(editor)).toEqual(before);
  });

  it("replays the same create operation without adding a duplicate", async () => {
    const first = await saveProjectAction(createInput);
    const second = await saveProjectAction(createInput);
    expect(first.status).toBe("success");
    expect(second.status).toBe("success");
    expect(
      (await getProjectRepository().listVisible(editor)).filter((project) => project.name === input.name),
    ).toHaveLength(1);
    expect(await saveProjectAction({ ...createInput, name: "Подмененный проект" })).toMatchObject({
      status: "error",
    });
  });
  it("keeps a confirmed save successful when cache revalidation fails", async () => {
    revalidatePath.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });
    await expect(saveProjectAction(createInput)).resolves.toMatchObject({ status: "success" });
    expect(
      (await getProjectRepository().listVisible(editor)).filter((project) => project.name === input.name),
    ).toHaveLength(1);
  });
  it("allows an administrator to archive another owner's project without editing it", async () => {
    mockSession.role = "admin";
    expect((await setProjectArchivedAction("forma", true)).status).toBe("success");
    expect((await getProjectRepository().findAccessible(admin, "forma"))?.archived).toBe(true);
    expect((await saveProjectAction({ ...input, id: "forma" })).status).toBe("error");
    expect(revalidatePath).toHaveBeenCalled();
  });
});

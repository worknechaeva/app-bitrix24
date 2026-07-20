import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSession = vi.hoisted(() => ({ role: "editor" as "admin" | "editor" }));
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "task-launcher-mock-role" ? { value: mockSession.role } : undefined),
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath }));

import { saveProjectAction, setProjectActiveAction } from "@/features/projects/actions";
import type { ProjectActionResult } from "@/features/projects/actions";
import { getProjectRepository, resetMockProjects } from "@/server/repositories/mock-project-repository";

const newProject = {
  name: "Проект проверки прав",
  websiteUrl: "https://authorization.example",
  bitrixGroupId: "919",
  bitrixGroupName: "Проверка прав",
  requiredTag: "authorization.example",
  defaultResponsibleId: "101",
  active: true,
};

function expectSafeAuthorizationError(result: ProjectActionResult) {
  expect(result).toEqual({
    status: "error",
    message: "Недостаточно прав для изменения проектов",
  });
  expect(JSON.stringify(result)).not.toMatch(/stack|trace|secret|token|webhook|cookie|repository|internal/i);
}

describe("project Server Action authorization", () => {
  beforeEach(() => {
    resetMockProjects();
    mockSession.role = "editor";
    revalidatePath.mockClear();
  });

  it("rejects direct editor calls to every project mutation without changing the repository", async () => {
    const repository = getProjectRepository();
    const before = await repository.listAll();
    const technarost = before.find((project) => project.id === "technarost")!;

    const results = [
      await saveProjectAction(newProject),
      await saveProjectAction({ ...technarost, name: "Недоступное изменение" }),
      await setProjectActiveAction("technarost", false),
      await setProjectActiveAction("archive", true),
    ];

    results.forEach(expectSafeAuthorizationError);
    expect(await repository.listAll()).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("allows an administrator to create update deactivate and reactivate a project", async () => {
    mockSession.role = "admin";
    const repository = getProjectRepository();

    const createResult = await saveProjectAction(newProject);
    expect(createResult.status).toBe("success");
    const created = (await repository.listAll()).find((project) => project.name === newProject.name)!;

    const updateResult = await saveProjectAction({
      ...created,
      name: "Проект с подтвержденными правами",
    });
    expect(updateResult.status).toBe("success");
    expect((await repository.findById(created.id))?.name).toBe("Проект с подтвержденными правами");

    const deactivateResult = await setProjectActiveAction(created.id, false);
    expect(deactivateResult.status).toBe("success");
    expect((await repository.findById(created.id))?.active).toBe(false);

    const reactivateResult = await setProjectActiveAction(created.id, true);
    expect(reactivateResult.status).toBe("success");
    expect((await repository.findById(created.id))?.active).toBe(true);
    expect(revalidatePath).toHaveBeenCalled();
  });
});

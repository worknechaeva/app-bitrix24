import { beforeEach, describe, expect, it, vi } from "vitest";
import { Bitrix24DirectoryError } from "@/integrations/bitrix24/directory-errors";

const repository = vi.hoisted(() => ({
  listVisible: vi.fn(),
  save: vi.fn(),
  setArchived: vi.fn(),
}));
const createDirectory = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/server/auth/runtime-mode", () => ({ getApplicationRuntimeMode: () => "live" }));
vi.mock("@/server/auth/application-session", () => ({
  getLiveApplicationSessionAuthority: async () => ({
    sessionToken: "session-token",
    actor: {
      sessionId: "session-id",
      portalInstallationId: 1,
      profileId: "11111111-1111-4111-8111-111111111111",
      role: "editor",
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  }),
}));
vi.mock("@/server/auth/app-session-service", () => ({ hashAppSessionToken: () => "a".repeat(64) }));
vi.mock("@/server/repositories/supabase-project-repository", () => ({
  createSupabaseProjectRepository: () => repository,
}));
vi.mock("@/server/directory/production-directory", () => ({
  createProductionBitrix24DirectoryClient: createDirectory,
}));

import {
  loadProjectPageData,
  reloadProjectListAction,
  saveProjectAction,
  setProjectArchivedAction,
} from "@/features/projects/actions";

const project = {
  id: "22222222-2222-4222-8222-222222222222",
  ownerProfileId: "11111111-1111-4111-8111-111111111111",
  name: "Проект",
  websiteUrl: "",
  bitrixEntityId: "77",
  bitrixEntityType: "project" as const,
  bitrixEntityTitle: "Проект Bitrix24",
  requiredTag: "project",
  defaultResponsibleId: "101",
  archived: false,
  canEdit: true,
  canArchive: true,
};

describe("project page data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.listVisible.mockResolvedValue([project]);
    repository.setArchived.mockResolvedValue({ outcome: "archived", projectId: project.id });
    repository.save.mockResolvedValue({ outcome: "created", projectId: project.id });
    createDirectory.mockReturnValue({
      listTaskEntities: vi.fn().mockResolvedValue([{ id: "77", title: "Проект Bitrix24", type: "project" }]),
      listEmployees: vi
        .fn()
        .mockResolvedValue([
          { id: "101", name: "Анна", lastName: "Иванова", position: "", departmentIds: [] },
        ]),
    });
  });

  it("keeps a confirmed save successful when refreshing the list fails", async () => {
    repository.listVisible.mockRejectedValueOnce(new Error("read failed"));
    await expect(
      saveProjectAction({
        name: "Проект",
        websiteUrl: "https://project.example",
        bitrixEntityId: "77",
        requiredTag: "project",
        defaultResponsibleId: "101",
        creationOperationKey: "33333333-3333-4333-8333-333333333333",
      }),
    ).resolves.toMatchObject({
      status: "success",
      projects: null,
      refreshRequired: true,
    });

    repository.listVisible.mockResolvedValue([project]);
    createDirectory.mockClear();
    createDirectory.mockImplementation(() => {
      throw new Error("Directory must not be constructed while reloading projects");
    });
    await expect(reloadProjectListAction()).resolves.toMatchObject({
      status: "success",
      projects: [project],
      refreshRequired: false,
    });
    expect(createDirectory).not.toHaveBeenCalled();
  });

  it("reports an unknown save result when storage does not return an outcome", async () => {
    repository.save.mockRejectedValueOnce(new Error("connection lost"));
    await expect(
      saveProjectAction({
        name: "Проект",
        websiteUrl: "https://project.example",
        bitrixEntityId: "77",
        requiredTag: "project",
        defaultResponsibleId: "101",
        creationOperationKey: "44444444-4444-4444-8444-444444444444",
      }),
    ).resolves.toMatchObject({ status: "error", code: "save_result_unknown" });
  });

  it("keeps saved projects readable and requests OAuth again when credentials expired", async () => {
    createDirectory.mockReturnValue({
      listTaskEntities: vi.fn().mockRejectedValue(new Bitrix24DirectoryError("unauthorized")),
      listEmployees: vi.fn().mockRejectedValue(new Bitrix24DirectoryError("unauthorized")),
    });

    await expect(loadProjectPageData()).resolves.toMatchObject({
      projects: [project],
      directoryStatus: "reauth_required",
    });
  });

  it("does not construct Directory for local archive operations", async () => {
    createDirectory.mockImplementation(() => {
      throw new Error("Directory must not be constructed");
    });

    await expect(setProjectArchivedAction(project.id, true)).resolves.toMatchObject({
      status: "success",
      projects: [project],
    });
    expect(createDirectory).not.toHaveBeenCalled();
  });
});

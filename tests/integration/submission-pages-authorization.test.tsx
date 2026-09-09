import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApplicationSession: vi.fn(),
  listSubmissions: vi.fn(() => []),
  listVisible: vi.fn(async () => []),
}));

vi.mock("@/server/auth/application-session", () => ({
  requireApplicationSession: mocks.requireApplicationSession,
}));
vi.mock("@/server/services/create-task", () => ({
  listSubmissions: mocks.listSubmissions,
}));
vi.mock("@/server/repositories/mock-project-repository", () => ({
  getProjectRepository: () => ({ listVisible: mocks.listVisible }),
}));

import DashboardPage from "@/app/(protected)/page";
import SubmissionsPage from "@/app/(protected)/submissions/page";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submission page authorization boundary", () => {
  it("passes the same verified mock-session actor to dashboard and history reads", async () => {
    const session = {
      mode: "mock",
      name: "Проверенный редактор",
      profileId: "verified-editor",
      role: "editor",
    } as const;
    mocks.requireApplicationSession.mockResolvedValue(session);

    await DashboardPage();
    await SubmissionsPage();

    expect(mocks.listSubmissions).toHaveBeenNthCalledWith(1, {
      profileId: "verified-editor",
      role: "editor",
    });
    expect(mocks.listSubmissions).toHaveBeenNthCalledWith(2, {
      profileId: "verified-editor",
      role: "editor",
    });
    expect(mocks.listVisible).toHaveBeenCalledTimes(2);
    expect(mocks.listVisible).toHaveBeenCalledWith({
      profileId: "verified-editor",
      role: "editor",
    });
  });

  it("returns the live placeholder before reading mock submissions or projects", async () => {
    mocks.requireApplicationSession.mockResolvedValue({
      mode: "live",
      name: "Пользователь Bitrix24",
      profileId: "live-profile",
      portalInstallationId: 1,
      role: "administrator",
    });

    await DashboardPage();
    await SubmissionsPage();

    expect(mocks.listSubmissions).not.toHaveBeenCalled();
    expect(mocks.listVisible).not.toHaveBeenCalled();
  });

  it("does not read history when the server-side session requirement rejects", async () => {
    mocks.requireApplicationSession.mockRejectedValue(new Error("REDIRECT:/login"));

    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/login");
    await expect(SubmissionsPage()).rejects.toThrow("REDIRECT:/login");

    expect(mocks.listSubmissions).not.toHaveBeenCalled();
    expect(mocks.listVisible).not.toHaveBeenCalled();
  });
});

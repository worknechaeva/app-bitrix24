import { describe, expect, it, vi } from "vitest";
import { hashAppSessionToken } from "@/server/auth/app-session-service";
import { ProfileAdminService } from "@/server/profile/profile-admin-service";
import type { ProfileLifecycleRepository } from "@/server/profile/profile-lifecycle-repository";

const sessionToken = Buffer.alloc(32, 0x42).toString("base64url");
const actorProfileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const targetProfileId = "118f47a7-7c60-7a31-8f6a-27f4bb596f5a";

function repositoryStub(): ProfileLifecycleRepository {
  return {
    bootstrapFirstAdministrator: vi.fn(async () => ({
      outcome: "already_administrator" as const,
      role: "administrator" as const,
      adminBootstrappedAt: "2026-08-12T12:00:00.000Z",
    })),
    changeRole: vi.fn(async () => ({ outcome: "updated" as const, role: "administrator" as const })),
    block: vi.fn(async () => ({
      outcome: "blocked" as const,
      sessionsRevoked: 2,
      credentialsDisabled: 1,
    })),
  };
}

function authority(role: "editor" | "administrator") {
  return {
    sessionToken,
    actor: {
      sessionId: "218f47a7-7c60-7a31-8f6a-27f4bb596f5a",
      profileId: actorProfileId,
      portalInstallationId: 1,
      role,
      expiresAt: "2026-09-12T12:00:00.000Z",
    },
  } as const;
}

describe("profile administrator service", () => {
  it("derives actor authority from the resolved application session and sends only its token hash", async () => {
    const repository = repositoryStub();
    const service = new ProfileAdminService(async () => authority("administrator"), repository);

    await expect(service.changeRole({ targetProfileId, role: "administrator" })).resolves.toEqual({
      outcome: "updated",
      role: "administrator",
    });
    expect(repository.changeRole).toHaveBeenCalledExactlyOnceWith({
      actorSessionTokenHash: hashAppSessionToken(sessionToken),
      targetProfileId,
      role: "administrator",
    });
    expect(JSON.stringify(vi.mocked(repository.changeRole).mock.calls)).not.toContain(sessionToken);
  });

  it("rejects editor and missing authorities before the lifecycle repository", async () => {
    for (const getAuthority of [async () => authority("editor"), async () => null]) {
      const repository = repositoryStub();
      const service = new ProfileAdminService(getAuthority, repository);
      await expect(service.block({ targetProfileId })).resolves.toEqual({ outcome: "unauthorized" });
      expect(repository.block).not.toHaveBeenCalled();
    }
  });

  it("ignores a spoofed browser actor field because actor identity is not part of the operation contract", async () => {
    const repository = repositoryStub();
    const service = new ProfileAdminService(async () => authority("administrator"), repository);
    const spoofedInput = {
      targetProfileId,
      role: "editor" as const,
      actorProfileId: targetProfileId,
    };

    await service.changeRole(spoofedInput);
    expect(repository.changeRole).toHaveBeenCalledWith({
      actorSessionTokenHash: hashAppSessionToken(sessionToken),
      targetProfileId,
      role: "editor",
    });
    expect(vi.mocked(repository.changeRole).mock.calls[0]?.[0]).not.toHaveProperty("actorProfileId");
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  ProfileLifecycleInputError,
  type ProfileLifecycleRepository,
} from "@/server/profile/profile-lifecycle-repository";
import {
  ProfileLifecycleStorageError,
  SupabaseProfileLifecycleRepository,
} from "@/server/profile/supabase-profile-lifecycle-repository";

const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const tokenHash = "a".repeat(64);

function createRepository(
  overrides: {
    bootstrap?: unknown;
    role?: unknown;
    block?: unknown;
  } = {},
): ProfileLifecycleRepository {
  return new SupabaseProfileLifecycleRepository(
    vi.fn(async () => ({
      data: overrides.bootstrap ?? [
        {
          outcome: "promoted",
          role: "administrator",
          admin_bootstrapped_at: "2026-08-12T12:00:00.000Z",
        },
      ],
      error: null,
    })),
    vi.fn(async () => ({
      data: overrides.role ?? [{ outcome: "updated", role: "administrator" }],
      error: null,
    })),
    vi.fn(async () => ({
      data: overrides.block ?? [{ outcome: "blocked", sessions_revoked: 3, credentials_disabled: 1 }],
      error: null,
    })),
  );
}

describe("Supabase profile lifecycle repository", () => {
  it("maps narrow bootstrap, role, and block RPC outcomes", async () => {
    const repository = createRepository();
    await expect(
      repository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId,
        verifiedBitrixUserId: "42",
      }),
    ).resolves.toEqual({
      outcome: "promoted",
      role: "administrator",
      adminBootstrappedAt: "2026-08-12T12:00:00.000Z",
    });
    await expect(
      repository.changeRole({
        actorSessionTokenHash: tokenHash,
        targetProfileId: profileId,
        role: "administrator",
      }),
    ).resolves.toEqual({ outcome: "updated", role: "administrator" });
    await expect(
      repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: profileId }),
    ).resolves.toEqual({ outcome: "blocked", sessionsRevoked: 3, credentialsDisabled: 1 });
  });

  it("rejects invalid identities and token hashes before database transport", async () => {
    const bootstrap = vi.fn();
    const role = vi.fn();
    const block = vi.fn();
    const repository = new SupabaseProfileLifecycleRepository(bootstrap, role, block);

    await expect(
      repository.bootstrapFirstAdministrator({
        portalInstallationId: 2,
        profileId,
        verifiedBitrixUserId: "42",
      }),
    ).rejects.toBeInstanceOf(ProfileLifecycleInputError);
    await expect(
      repository.changeRole({
        actorSessionTokenHash: "raw-token",
        targetProfileId: profileId,
        role: "editor",
      }),
    ).rejects.toBeInstanceOf(ProfileLifecycleInputError);
    await expect(
      repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: "not-a-uuid" }),
    ).rejects.toBeInstanceOf(ProfileLifecycleInputError);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(role).not.toHaveBeenCalled();
    expect(block).not.toHaveBeenCalled();
  });

  it("normalizes malformed database responses without exposing details", async () => {
    const repository = createRepository({
      bootstrap: [{ outcome: "promoted", role: null, admin_bootstrapped_at: null }],
      role: [{ outcome: "updated", role: null }],
      block: [{ outcome: "blocked", sessions_revoked: -1, credentials_disabled: 0 }],
    });
    const calls = [
      repository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId,
        verifiedBitrixUserId: "42",
      }),
      repository.changeRole({ actorSessionTokenHash: tokenHash, targetProfileId: profileId, role: "editor" }),
      repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: profileId }),
    ];
    for (const call of calls) await expect(call).rejects.toBeInstanceOf(ProfileLifecycleStorageError);
  });
});

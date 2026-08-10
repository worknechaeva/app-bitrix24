import { describe, expect, it, vi } from "vitest";
import { AppSessionInputError } from "@/server/auth/app-session-repository";
import {
  AppSessionStorageError,
  SupabaseAppSessionRepository,
} from "@/server/auth/supabase-app-session-repository";

const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const sessionId = "118f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const tokenHash = "a".repeat(64);
const createdAt = "2026-08-10T12:00:00.000Z";
const expiresAt = "2026-09-09T12:00:00.000Z";

const createdRow = {
  outcome: "created",
  session_id: sessionId,
  profile_id: profileId,
  portal_installation_id: 1,
  created_at: createdAt,
  expires_at: expiresAt,
};

describe("Supabase app session repository", () => {
  it("creates only through the narrow hash RPC and maps database timestamps", async () => {
    const create = vi.fn().mockResolvedValue({ data: [createdRow], error: null });
    const repository = new SupabaseAppSessionRepository(create, vi.fn(), vi.fn());

    await expect(repository.create({ portalInstallationId: 1, profileId, tokenHash })).resolves.toEqual({
      outcome: "created",
      session: {
        id: sessionId,
        profileId,
        portalInstallationId: 1,
        createdAt,
        expiresAt,
      },
    });
    expect(create).toHaveBeenCalledExactlyOnceWith({
      p_portal_installation_id: 1,
      p_profile_id: profileId,
      p_token_hash: tokenHash,
    });
  });

  it.each(["profile_unknown", "profile_inactive"] as const)("maps %s creation", async (outcome) => {
    const repository = new SupabaseAppSessionRepository(
      vi.fn().mockResolvedValue({
        data: [
          {
            outcome,
            session_id: null,
            profile_id: null,
            portal_installation_id: null,
            created_at: null,
            expires_at: null,
          },
        ],
        error: null,
      }),
      vi.fn(),
      vi.fn(),
    );

    await expect(repository.create({ portalInstallationId: 1, profileId, tokenHash })).resolves.toEqual({
      outcome,
    });
  });

  it("maps active resolution to minimal actor context", async () => {
    const resolve = vi.fn().mockResolvedValue({
      data: [
        {
          outcome: "active",
          session_id: sessionId,
          profile_id: profileId,
          portal_installation_id: 1,
          role: "administrator",
          expires_at: expiresAt,
        },
      ],
      error: null,
    });
    const repository = new SupabaseAppSessionRepository(vi.fn(), resolve, vi.fn());

    await expect(repository.resolve(tokenHash)).resolves.toEqual({
      outcome: "active",
      actor: {
        sessionId,
        profileId,
        portalInstallationId: 1,
        role: "administrator",
        expiresAt,
      },
    });
    expect(resolve).toHaveBeenCalledWith({ p_token_hash: tokenHash });
  });

  it.each(["unknown", "expired", "revoked", "profile_inactive"] as const)(
    "maps %s without leaked actor fields",
    async (outcome) => {
      const repository = new SupabaseAppSessionRepository(
        vi.fn(),
        vi.fn().mockResolvedValue({
          data: [
            {
              outcome,
              session_id: null,
              profile_id: null,
              portal_installation_id: null,
              role: null,
              expires_at: null,
            },
          ],
          error: null,
        }),
        vi.fn(),
      );

      await expect(repository.resolve(tokenHash)).resolves.toEqual({ outcome });
    },
  );

  it.each(["revoked", "unknown", "already_revoked", "expired"] as const)(
    "maps %s revocation",
    async (outcome) => {
      const revoke = vi.fn().mockResolvedValue({ data: [{ outcome }], error: null });
      const repository = new SupabaseAppSessionRepository(vi.fn(), vi.fn(), revoke);

      await expect(repository.revoke(tokenHash)).resolves.toEqual({ outcome });
      expect(revoke).toHaveBeenCalledWith({ p_token_hash: tokenHash });
    },
  );

  it.each([
    { portalInstallationId: 2, profileId, tokenHash },
    { portalInstallationId: 1, profileId: "not-a-uuid", tokenHash },
    { portalInstallationId: 1, profileId, tokenHash: "raw-token" },
  ])("rejects invalid input before transport", async (input) => {
    const create = vi.fn();
    const repository = new SupabaseAppSessionRepository(create, vi.fn(), vi.fn());

    await expect(repository.create(input)).rejects.toBeInstanceOf(AppSessionInputError);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    () => Promise.reject(new Error("raw-token-and-service-role-key-must-not-escape")),
    () => Promise.resolve({ data: null, error: { message: "sensitive SQL error" } }),
    () => Promise.resolve({ data: [], error: null }),
  ])("normalizes storage failures without diagnostic details", async (create) => {
    const repository = new SupabaseAppSessionRepository(create, vi.fn(), vi.fn());

    let thrown: unknown;
    try {
      await repository.create({ portalInstallationId: 1, profileId, tokenHash });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining<Partial<AppSessionStorageError>>({
        code: "app_session_storage_failure",
        message: "App session storage failure",
      }),
    );
    expect(String(thrown)).not.toContain("raw-token");
    expect(String(thrown)).not.toContain("service-role-key");
    expect(String(thrown)).not.toContain("SQL error");
  });

  it("fails closed when inactive resolution exposes actor identity", async () => {
    const repository = new SupabaseAppSessionRepository(
      vi.fn(),
      vi.fn().mockResolvedValue({
        data: [
          {
            outcome: "expired",
            session_id: sessionId,
            profile_id: profileId,
            portal_installation_id: 1,
            role: "editor",
            expires_at: expiresAt,
          },
        ],
        error: null,
      }),
      vi.fn(),
    );

    await expect(repository.resolve(tokenHash)).rejects.toBeInstanceOf(AppSessionStorageError);
  });
});

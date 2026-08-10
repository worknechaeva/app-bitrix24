import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AppSessionRepository } from "@/server/auth/app-session-repository";
import {
  AppSessionService,
  AppSessionServiceError,
  hashAppSessionToken,
} from "@/server/auth/app-session-service";

const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const sessionId = "118f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const createdAt = "2026-08-10T12:00:00.000Z";
const expiresAt = "2026-09-09T12:00:00.000Z";

function repositoryStub(): AppSessionRepository {
  return {
    create: vi.fn(
      async () =>
        ({
          outcome: "created",
          session: { id: sessionId, profileId, portalInstallationId: 1, createdAt, expiresAt },
        }) as const,
    ),
    resolve: vi.fn(async () => ({ outcome: "unknown" }) as const),
    revoke: vi.fn(async () => ({ outcome: "unknown" }) as const),
  };
}

describe("app session service", () => {
  it("requests 32 random bytes and passes only a full SHA-256 hash to storage", async () => {
    const repository = repositoryStub();
    const random = vi.fn(() => Buffer.alloc(32, 0xab));
    const service = new AppSessionService(repository, random);

    const issued = await service.issue({ portalInstallationId: 1, profileId });

    expect(random).toHaveBeenCalledExactlyOnceWith(32);
    expect(issued.outcome).toBe("created");
    if (issued.outcome !== "created") throw new Error("Expected a created session");
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.token).not.toContain("=");
    expect(repository.create).toHaveBeenCalledExactlyOnceWith({
      portalInstallationId: 1,
      profileId,
      tokenHash: hashAppSessionToken(issued.token),
    });
    expect(JSON.stringify(vi.mocked(repository.create).mock.calls)).not.toContain(issued.token);
  });

  it("hashes deterministically with the full lowercase SHA-256 digest", () => {
    const token = "synthetic_URL-safe-token";
    const expected = createHash("sha256").update(token, "utf8").digest("hex");

    expect(hashAppSessionToken(token)).toBe(expected);
    expect(hashAppSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the raw token only for a successfully created session", async () => {
    const repository = repositoryStub();
    vi.mocked(repository.create).mockResolvedValueOnce({ outcome: "profile_inactive" });
    const service = new AppSessionService(repository, () => Buffer.alloc(32, 0xcd));

    const result = await service.issue({ portalInstallationId: 1, profileId });

    expect(result).toEqual({ outcome: "profile_inactive" });
    expect(result).not.toHaveProperty("token");
  });

  it("hashes valid tokens before resolve and revoke", async () => {
    const repository = repositoryStub();
    const service = new AppSessionService(repository);
    const token = Buffer.alloc(32, 0xef).toString("base64url");

    await service.resolve(token);
    await service.revoke(token);

    expect(repository.resolve).toHaveBeenCalledExactlyOnceWith(hashAppSessionToken(token));
    expect(repository.revoke).toHaveBeenCalledExactlyOnceWith(hashAppSessionToken(token));
    expect(JSON.stringify(vi.mocked(repository.resolve).mock.calls)).not.toContain(token);
    expect(JSON.stringify(vi.mocked(repository.revoke).mock.calls)).not.toContain(token);
  });

  it.each(["", "not_base64url!", "a".repeat(42), "a".repeat(44), "сырой-token"])(
    "normalizes malformed token without storage lookup or token-bearing errors: %s",
    async (token) => {
      const repository = repositoryStub();
      const service = new AppSessionService(repository);

      await expect(service.resolve(token)).resolves.toEqual({ outcome: "unknown" });
      await expect(service.revoke(token)).resolves.toEqual({ outcome: "unknown" });
      expect(repository.resolve).not.toHaveBeenCalled();
      expect(repository.revoke).not.toHaveBeenCalled();
    },
  );

  it("normalizes repository failures without exposing the raw token", async () => {
    const repository = repositoryStub();
    const token = Buffer.alloc(32, 0x7a).toString("base64url");
    vi.mocked(repository.resolve).mockRejectedValueOnce(new Error(`storage leaked ${token}`));
    const service = new AppSessionService(repository);

    let thrown: unknown;
    try {
      await service.resolve(token);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppSessionServiceError);
    expect(String(thrown)).not.toContain(token);
  });

  it.each(["expired", "revoked", "profile_inactive"] as const)(
    "preserves the typed %s resolution without actor context",
    async (outcome) => {
      const repository = repositoryStub();
      vi.mocked(repository.resolve).mockResolvedValueOnce({ outcome });
      const service = new AppSessionService(repository);

      await expect(service.resolve(Buffer.alloc(32, 0x11).toString("base64url"))).resolves.toEqual({
        outcome,
      });
    },
  );
});

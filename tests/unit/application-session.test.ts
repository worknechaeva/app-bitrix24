import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSessionRepository } from "@/server/auth/app-session-repository";
import { hashAppSessionToken } from "@/server/auth/app-session-service";
import {
  APPLICATION_SESSION_COOKIE_NAME,
  readApplicationSessionCookie,
  serializeApplicationSessionCookie,
} from "@/server/auth/session-cookie";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookieSet: vi.fn(),
  cookieDelete: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  repository: {
    create: vi.fn(),
    resolve: vi.fn(),
    revoke: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet, set: mocks.cookieSet, delete: mocks.cookieDelete })),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/auth/supabase-app-session-repository", () => ({
  createSupabaseAppSessionRepository: () => mocks.repository as AppSessionRepository,
}));

import { getApplicationSession, logoutApplicationSession } from "@/server/auth/application-session";

const token = Buffer.alloc(32, 0xaa).toString("base64url");
const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("APP_RUNTIME_MODE", "live");
  mocks.cookieGet.mockImplementation((name: string) =>
    name === APPLICATION_SESSION_COOKIE_NAME ? { value: token } : undefined,
  );
  mocks.repository.resolve.mockResolvedValue({ outcome: "unknown" });
  mocks.repository.revoke.mockResolvedValue({ outcome: "unknown" });
});

describe("application session cookie", () => {
  it("uses the exact __Host cookie attributes and no Domain", () => {
    const cookie = serializeApplicationSessionCookie(token, "2026-09-10T12:00:00.000Z");
    expect(cookie).toContain(`${APPLICATION_SESSION_COOKIE_NAME}=${token}`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain=");
  });

  it("rejects duplicate browser cookies", () => {
    const request = new Request("https://launcher.example", {
      headers: {
        Cookie: `${APPLICATION_SESSION_COOKIE_NAME}=${token}; ${APPLICATION_SESSION_COOKIE_NAME}=other`,
      },
    });
    expect(readApplicationSessionCookie(request)).toBeUndefined();
  });
});

describe("application session facade", () => {
  it("returns current profile role only from persistent resolve", async () => {
    mocks.repository.resolve.mockResolvedValueOnce({
      outcome: "active",
      actor: {
        sessionId: "118f47a7-7c60-7a31-8f6a-27f4bb596f5a",
        profileId,
        portalInstallationId: 1,
        role: "administrator",
        expiresAt: "2026-09-10T12:00:00.000Z",
      },
    });
    await expect(getApplicationSession()).resolves.toMatchObject({
      mode: "live",
      profileId,
      portalInstallationId: 1,
      role: "administrator",
    });
    expect(mocks.repository.resolve).toHaveBeenCalledExactlyOnceWith(hashAppSessionToken(token));
  });

  it.each(["unknown", "expired", "revoked", "profile_inactive"] as const)(
    "treats %s as unauthenticated",
    async (outcome) => {
      mocks.repository.resolve.mockResolvedValueOnce({ outcome });
      await expect(getApplicationSession()).resolves.toBeNull();
    },
  );

  it("clears the cookie and redirects even when revocation storage fails", async () => {
    mocks.repository.revoke.mockRejectedValueOnce(new Error(`storage leaked ${token}`));
    await expect(logoutApplicationSession()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.repository.revoke).toHaveBeenCalledExactlyOnceWith(hashAppSessionToken(token));
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      APPLICATION_SESSION_COOKIE_NAME,
      "",
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "lax", path: "/" }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});

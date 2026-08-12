import { describe, expect, it, vi } from "vitest";
import type {
  Bitrix24CurrentUser,
  Bitrix24IdentityClient,
  Bitrix24OAuthResult,
} from "@/integrations/bitrix24/identity-client";
import { parseProductionOAuthConfiguration } from "@/lib/env/production-oauth";
import type { AppSessionRepository } from "@/server/auth/app-session-repository";
import { AppSessionService, hashAppSessionToken } from "@/server/auth/app-session-service";
import {
  handleProductionOAuthCallback,
  handleProductionOAuthInstall,
  handleProductionOAuthStart,
  type ProductionOAuthRuntime,
} from "@/server/auth/production-oauth";
import { APPLICATION_SESSION_COOKIE_NAME } from "@/server/auth/session-cookie";
import { Bitrix24CredentialCrypto } from "@/server/credentials/bitrix24-credential-crypto";
import type { Bitrix24CredentialRepository } from "@/server/credentials/bitrix24-credential-repository";
import { Bitrix24CredentialService } from "@/server/credentials/bitrix24-credential-service";
import { OAuthStateService, hashOAuthState } from "@/server/oauth/oauth-state-service";
import type {
  OAuthTransactionConsumption,
  OAuthTransactionRepository,
} from "@/server/oauth/oauth-transaction-repository";
import type { PortalInstallationRepository } from "@/server/portal/portal-installation-repository";
import type { Profile, ProfileRepository } from "@/server/profile/profile-repository";
import type { ProfileLifecycleRepository } from "@/server/profile/profile-lifecycle-repository";

const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const sessionId = "118f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const expiresAt = "2026-09-10T12:00:00.000Z";
const config = parseProductionOAuthConfiguration({
  TASK_LAUNCHER_APP_ORIGIN: "https://launcher.example",
  BITRIX24_OAUTH_CLIENT_ID: "client-id",
  BITRIX24_OAUTH_CLIENT_SECRET: "client-secret-must-not-escape",
  BITRIX24_PORTAL_MEMBER_ID: "a".repeat(32),
  BITRIX24_PORTAL_ORIGIN: "https://portal.example",
});
const authorization: Bitrix24OAuthResult = {
  accessToken: "access-token-must-not-escape",
  refreshToken: "refresh-token-must-not-escape",
  memberId: "a".repeat(32),
  clientEndpoint: "https://portal.example/rest/",
  scope: ["app"],
  userId: "42",
  accessTokenExpiresAt: "2026-08-11T13:00:00.000Z",
};
const profile: Profile = {
  id: profileId,
  portalInstallationId: 1,
  bitrixUserId: "42",
  role: "editor",
  isActive: true,
  identitySnapshot: { active: true, userType: "employee", verifiedAt: "2026-08-11T12:00:00.000Z" },
  createdAt: "2026-08-11T12:00:00.000Z",
  updatedAt: "2026-08-11T12:00:00.000Z",
};

class MemoryOAuthRepository implements OAuthTransactionRepository {
  stateHash?: string;
  returnPath = "/";
  consumed = false;
  consumeOutcome?: OAuthTransactionConsumption;

  async create(input: { stateHash: string; returnPath: string }) {
    this.stateHash = input.stateHash;
    this.returnPath = input.returnPath;
    return {
      id: sessionId,
      returnPath: input.returnPath,
      createdAt: "2026-08-11T12:00:00.000Z",
      expiresAt: "2026-08-11T12:10:00.000Z",
    };
  }

  async consume(stateHash: string): Promise<OAuthTransactionConsumption> {
    if (this.consumeOutcome) return this.consumeOutcome;
    if (this.consumed) return { outcome: "already_consumed" };
    if (stateHash !== this.stateHash) return { outcome: "unknown" };
    this.consumed = true;
    return { outcome: "consumed", returnPath: this.returnPath };
  }
}

class FakeIdentityClient implements Bitrix24IdentityClient {
  authorization = authorization;
  permissions = ["user_brief"];
  user: Bitrix24CurrentUser = { id: "42", active: true, userType: "employee" };
  exchangeError?: unknown;
  exchangeAuthorizationCode = vi.fn(async () => {
    if (this.exchangeError) throw this.exchangeError;
    return this.authorization;
  });
  refreshTokenPair = vi.fn(async () => this.authorization);
  getApplicationPermissions = vi.fn(async () => this.permissions);
  getCurrentUser = vi.fn(async () => this.user);
  createAuthorizationUrl(input: { state: string; redirectUri: string }) {
    const url = new URL("https://portal.example/oauth/authorize/");
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return url.toString();
  }
}

function credentialRepository(): Bitrix24CredentialRepository {
  return {
    createInitial: vi.fn(async () => ({ outcome: "profile_unknown" }) as const),
    resolve: vi.fn(async () => ({ outcome: "unknown" }) as const),
    rotate: vi.fn(async () => ({ outcome: "version_conflict" }) as const),
    markReauthRequired: vi.fn(async () => ({ outcome: "unknown" }) as const),
    inspectForVerifiedOAuth: vi.fn(async () => ({ outcome: "missing", nextTokenVersion: 1 }) as const),
    replaceAfterVerifiedOAuth: vi.fn(async () => ({ outcome: "created", tokenVersion: 1 }) as const),
  };
}

function sessionRepository(): AppSessionRepository {
  return {
    create: vi.fn(
      async () =>
        ({
          outcome: "created",
          session: {
            id: sessionId,
            profileId,
            portalInstallationId: 1,
            createdAt: "2026-08-11T12:00:00.000Z",
            expiresAt,
          },
        }) as const,
    ),
    resolve: vi.fn(async () => ({ outcome: "unknown" }) as const),
    revoke: vi.fn(async () => ({ outcome: "revoked" }) as const),
  };
}

function makeRuntime() {
  const oauthRepository = new MemoryOAuthRepository();
  const identity = new FakeIdentityClient();
  const credentials = credentialRepository();
  const sessions = sessionRepository();
  const portalRepository: PortalInstallationRepository = {
    reconcileTrustedIdentity: vi.fn(async (identity) => ({
      outcome: "unchanged" as const,
      installation: identity,
    })),
  };
  const profileRepository: ProfileRepository = {
    reconcileVerifiedEmployee: vi.fn(async () => ({ outcome: "unchanged" as const, profile })),
  };
  const profileLifecycleRepository: ProfileLifecycleRepository = {
    bootstrapFirstAdministrator: vi.fn(async () => ({
      outcome: "promoted" as const,
      role: "administrator" as const,
      adminBootstrappedAt: "2026-08-12T12:00:00.000Z",
    })),
    changeRole: vi.fn(async () => ({ outcome: "unauthorized" as const, role: null })),
    block: vi.fn(async () => ({
      outcome: "unauthorized" as const,
      sessionsRevoked: 0,
      credentialsDisabled: 0,
    })),
  };
  const logs: unknown[] = [];
  const runtime: ProductionOAuthRuntime = {
    config,
    identityClient: identity,
    stateService: new OAuthStateService(oauthRepository, () => Buffer.alloc(32, 0xab)),
    portalRepository,
    profileRepository,
    profileLifecycleRepository,
    bootstrapAdminBitrixUserId: null,
    credentialService: new Bitrix24CredentialService(
      credentials,
      new Bitrix24CredentialCrypto(Buffer.alloc(32, 0x5a)),
    ),
    sessionService: new AppSessionService(sessions, () => Buffer.alloc(32, 0xcd)),
    logger: { info: (event, details) => logs.push({ event, details }) },
  };
  return {
    runtime,
    oauthRepository,
    identity,
    credentials,
    sessions,
    portalRepository,
    profileRepository,
    profileLifecycleRepository,
    logs,
  };
}

async function issueState(runtime: ProductionOAuthRuntime, returnPath = "/") {
  return (await runtime.stateService.issue(returnPath)).state;
}

describe("production OAuth start", () => {
  it("persists only the state hash and redirects with raw state and safe return path", async () => {
    const { runtime, oauthRepository } = makeRuntime();
    const response = await handleProductionOAuthStart(
      new Request("https://launcher.example/api/bitrix24/oauth/start?return_path=%2Fsettings"),
      runtime,
    );
    const location = new URL(response.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    expect(response.status).toBe(302);
    expect(oauthRepository.returnPath).toBe("/settings");
    expect(oauthRepository.stateHash).toBe(hashOAuthState(state));
    expect(oauthRepository.stateHash).not.toBe(state);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each(["https://evil.example", "//evil.example", "/%2f%2fevil", "/\\evil"])(
    "rejects unsafe return path %s before persistence",
    async (returnPath) => {
      const { runtime, oauthRepository } = makeRuntime();
      const response = await handleProductionOAuthStart(
        new Request(
          `https://launcher.example/api/bitrix24/oauth/start?return_path=${encodeURIComponent(returnPath)}`,
        ),
        runtime,
      );
      expect(response.status).toBe(400);
      expect(oauthRepository.stateHash).toBeUndefined();
    },
  );
});

describe("production OAuth callback", () => {
  it.each([
    "https://launcher.example/api/bitrix24/oauth/callback?code=code",
    "https://launcher.example/api/bitrix24/oauth/callback?state=one&state=two&code=code",
  ])("rejects missing or duplicate state before provider work", async (url) => {
    const { runtime, identity } = makeRuntime();
    const response = await handleProductionOAuthCallback(new Request(url), runtime);
    expect(response.status).toBe(400);
    expect(identity.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("consumes state before provider denial and blocks replay", async () => {
    const { runtime, identity } = makeRuntime();
    const state = await issueState(runtime);
    const denied = await handleProductionOAuthCallback(
      new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&error=access_denied`),
      runtime,
    );
    const replay = await handleProductionOAuthCallback(
      new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );
    expect(denied.status).toBe(400);
    await expect(replay.json()).resolves.toMatchObject({ reasonCode: "reused_state" });
    expect(identity.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown", "invalid_state"],
    ["expired", "expired_state"],
    ["already_consumed", "reused_state"],
  ] as const)("does not exchange code for %s state", async (outcome, reasonCode) => {
    const { runtime, oauthRepository, identity } = makeRuntime();
    oauthRepository.consumeOutcome = { outcome };
    const response = await handleProductionOAuthCallback(
      new Request("https://launcher.example/api/bitrix24/oauth/callback?state=state&code=code"),
      runtime,
    );
    await expect(response.json()).resolves.toMatchObject({ reasonCode });
    expect(identity.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it.each([
    (state: string) => `https://launcher.example/api/bitrix24/oauth/callback?state=${state}`,
    (state: string) =>
      `https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=one&code=two`,
  ])("rejects missing or duplicate code after consuming state", async (urlForState) => {
    const { runtime, identity } = makeRuntime();
    const state = await issueState(runtime);
    const response = await handleProductionOAuthCallback(new Request(urlForState(state)), runtime);
    expect(response.status).toBe(400);
    expect(identity.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("rejects missing user_brief permission before persistence", async () => {
    const { runtime, identity, portalRepository } = makeRuntime();
    identity.permissions = ["tasks"];
    const state = await issueState(runtime);
    const response = await handleProductionOAuthCallback(
      new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );
    expect(response.status).toBe(400);
    expect(portalRepository.reconcileTrustedIdentity).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong member", { memberId: "b".repeat(32) }, {}, 400],
    ["missing app", { scope: ["user"] }, {}, 400],
    ["provider user mismatch", { userId: "99" }, {}, 400],
    ["inactive", {}, { active: false }, 403],
    ["external", {}, { userType: "extranet" }, 403],
  ] as Array<[string, Partial<Bitrix24OAuthResult>, Partial<Bitrix24CurrentUser>, number]>)(
    "rejects %s before persistence",
    async (_name, authOverrides, userOverrides, expectedStatus) => {
      const { runtime, identity, portalRepository, sessions } = makeRuntime();
      identity.authorization = { ...authorization, ...authOverrides };
      identity.user = { ...identity.user, ...userOverrides };
      const state = await issueState(runtime);
      const response = await handleProductionOAuthCallback(
        new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
        runtime,
      );
      expect(response.status).toBe(expectedStatus);
      expect(portalRepository.reconcileTrustedIdentity).not.toHaveBeenCalled();
      expect(sessions.create).not.toHaveBeenCalled();
    },
  );

  it("creates encrypted credentials, rotates the browser session, and redirects only to consumed path", async () => {
    const { runtime, credentials, sessions, logs } = makeRuntime();
    const state = await issueState(runtime, "/settings");
    const previousToken = Buffer.alloc(32, 0xee).toString("base64url");
    const response = await handleProductionOAuthCallback(
      new Request(
        `https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=secret-code&redirect=https://evil.example`,
        {
          headers: { Cookie: `${APPLICATION_SESSION_COOKIE_NAME}=${previousToken}` },
        },
      ),
      runtime,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/settings");
    expect(sessions.revoke).toHaveBeenCalledExactlyOnceWith(hashAppSessionToken(previousToken));
    expect(sessions.create).toHaveBeenCalledOnce();
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain(`${APPLICATION_SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Domain=");
    expect(cookie).not.toContain(profileId);
    const persisted = vi.mocked(credentials.replaceAfterVerifiedOAuth).mock.calls[0]?.[0];
    expect(persisted).not.toHaveProperty("accessToken");
    expect(persisted).not.toHaveProperty("refreshToken");
    const exposed = `${await response.text()}${JSON.stringify(logs)}${response.headers.toString()}`;
    for (const secret of [
      authorization.accessToken,
      authorization.refreshToken,
      "secret-code",
      previousToken,
    ]) {
      expect(exposed).not.toContain(secret);
    }
  });

  it("bootstraps only the matching verified active employee after credentials and before session issuance", async () => {
    const { runtime, profileLifecycleRepository, credentials, sessions } = makeRuntime();
    runtime.bootstrapAdminBitrixUserId = "42";
    const state = await issueState(runtime);
    const response = await handleProductionOAuthCallback(
      new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );
    expect(response.status).toBe(302);
    expect(profileLifecycleRepository.bootstrapFirstAdministrator).toHaveBeenCalledExactlyOnceWith({
      portalInstallationId: 1,
      profileId,
      verifiedBitrixUserId: "42",
    });
    expect(
      vi.mocked(profileLifecycleRepository.bootstrapFirstAdministrator).mock.invocationCallOrder[0],
    ).toBeGreaterThan(vi.mocked(credentials.replaceAfterVerifiedOAuth).mock.invocationCallOrder[0]!);
    expect(
      vi.mocked(profileLifecycleRepository.bootstrapFirstAdministrator).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(sessions.create).mock.invocationCallOrder[0]!);
    expect(sessions.create).toHaveBeenCalledOnce();
  });

  it("leaves a nonmatching verified profile unchanged by bootstrap", async () => {
    const { runtime, profileLifecycleRepository } = makeRuntime();
    runtime.bootstrapAdminBitrixUserId = "99";
    const state = await issueState(runtime);
    const response = await handleProductionOAuthCallback(
      new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );
    expect(response.status).toBe(302);
    expect(profileLifecycleRepository.bootstrapFirstAdministrator).not.toHaveBeenCalled();
  });

  it("does not issue a session when verified OAuth credentials are disabled", async () => {
    const { runtime, credentials, profileLifecycleRepository, sessions } = makeRuntime();
    runtime.bootstrapAdminBitrixUserId = "42";
    vi.mocked(credentials.inspectForVerifiedOAuth).mockResolvedValueOnce({ outcome: "disabled" });
    const state = await issueState(runtime);
    const response = await handleProductionOAuthCallback(
      new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );
    expect(response.status).toBe(403);
    expect(profileLifecycleRepository.bootstrapFirstAdministrator).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a locally inactive reconciled profile before credentials and session", async () => {
    const { runtime, profileRepository, credentials, sessions } = makeRuntime();
    vi.mocked(profileRepository.reconcileVerifiedEmployee).mockResolvedValueOnce({
      outcome: "inactive",
      profile: { ...profile, isActive: false },
    });
    const state = await issueState(runtime);
    const response = await handleProductionOAuthCallback(
      new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );
    expect(response.status).toBe(403);
    expect(credentials.inspectForVerifiedOAuth).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("returns controlled failure without a success cookie when session issuance is rejected", async () => {
    const { runtime, sessions } = makeRuntime();
    vi.mocked(sessions.create).mockResolvedValueOnce({ outcome: "profile_inactive" });
    const state = await issueState(runtime);
    const response = await handleProductionOAuthCallback(
      new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed when old-session revocation fails", async () => {
    const { runtime, sessions } = makeRuntime();
    vi.mocked(sessions.revoke).mockRejectedValueOnce(new Error("storage detail"));
    const state = await issueState(runtime);
    const response = await handleProductionOAuthCallback(
      new Request(`https://launcher.example/api/bitrix24/oauth/callback?state=${state}&code=code`, {
        headers: {
          Cookie: `${APPLICATION_SESSION_COOKIE_NAME}=${Buffer.alloc(32, 1).toString("base64url")}`,
        },
      }),
      runtime,
    );
    expect(response.status).toBe(500);
    expect(sessions.create).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("production OAuth install receipt", () => {
  it("accepts only the configured portal and discards installer credentials", async () => {
    const body = new URLSearchParams({
      event: "ONAPPINSTALL",
      "auth[access_token]": "installer-access-must-not-escape",
      "auth[refresh_token]": "installer-refresh-must-not-escape",
      "auth[member_id]": "a".repeat(32),
      "auth[client_endpoint]": "https://portal.example/rest/",
    });
    const response = await handleProductionOAuthInstall(
      new Request("https://launcher.example/api/bitrix24/oauth/install", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
      config,
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("installer-access");
    expect(text).not.toContain("installer-refresh");
  });

  it("rejects another portal without creating auth state", async () => {
    const response = await handleProductionOAuthInstall(
      new Request("https://launcher.example/api/bitrix24/oauth/install", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          event: "ONAPPINSTALL",
          "auth[access_token]": "access",
          "auth[refresh_token]": "refresh",
          "auth[member_id]": "b".repeat(32),
          "auth[client_endpoint]": "https://evil.example/rest/",
        }),
      }),
      config,
    );
    expect(response.status).toBe(400);
  });
});

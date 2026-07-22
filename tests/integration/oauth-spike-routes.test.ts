import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Bitrix24CurrentUser,
  Bitrix24IdentityClient,
  Bitrix24OAuthResult,
} from "@/integrations/bitrix24/identity-client";
import { OAuthSpikeError } from "@/integrations/bitrix24/spike/errors";
import { EphemeralOAuthStateStore } from "@/server/oauth-spike/ephemeral-state-store";
import {
  handleOAuthSpikeCallback,
  handleOAuthSpikeInstall,
  handleOAuthSpikeStart,
} from "@/server/oauth-spike/route-handlers";
import type { OAuthSpikeInstallRuntime, OAuthSpikeUserRuntime } from "@/server/oauth-spike/runtime";

const expectedMemberId = "a".repeat(32);
const authorization: Bitrix24OAuthResult = {
  accessToken: "browser-must-not-see-access-token",
  refreshToken: "browser-must-not-see-refresh-token",
  memberId: expectedMemberId,
  clientEndpoint: "https://portal.example/rest/",
  expiresIn: 3600,
  scope: ["user_brief"],
  userId: "browser-must-not-see-user-id",
};

class FakeIdentityClient implements Bitrix24IdentityClient {
  authorization = authorization;
  currentUser: Bitrix24CurrentUser = {
    id: "browser-must-not-see-user-id",
    active: true,
    userType: "employee",
  };
  exchangeError?: unknown;
  readonly exchangeAuthorizationCode = vi.fn(async () => {
    if (this.exchangeError) throw this.exchangeError;
    return this.authorization;
  });
  readonly refreshTokenPair = vi.fn(async () => this.authorization);
  readonly getCurrentUser = vi.fn(async () => this.currentUser);

  createAuthorizationUrl(input: { state: string; redirectUri: string }): string {
    const url = new URL("https://portal.example/oauth/authorize/");
    url.searchParams.set("client_id", "local.test");
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return url.toString();
  }
}

function makeRuntime(client = new FakeIdentityClient()) {
  const logEntries: Array<{ event: string; details: Record<string, boolean | string> }> = [];
  const runtime: OAuthSpikeUserRuntime = {
    status: "enabled",
    config: {
      enabled: true,
      appOrigin: "https://harness.example",
      portalOrigin: "https://portal.example",
      expectedMemberId,
      clientId: "local.test",
      clientSecret: "browser-must-not-see-client-secret",
      redirectUri: "https://harness.example/api/bitrix24/oauth/callback",
      scopes: ["user_brief"],
      tokenEndpoint: "https://oauth.bitrix.info/oauth/token/",
    },
    identityClient: client,
    stateStore: new EphemeralOAuthStateStore(),
    logger: {
      info(event, details) {
        logEntries.push({ event, details });
      },
    },
  };
  return { runtime, client, logEntries };
}

function makeInstallRuntime() {
  const logEntries: Array<{ event: string; details: Record<string, boolean | string> }> = [];
  const runtime: OAuthSpikeInstallRuntime = {
    status: "enabled",
    logger: {
      info(event, details) {
        logEntries.push({ event, details });
      },
    },
  };
  return { runtime, logEntries };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("OAuth spike route handlers", () => {
  it("does not accept a portal from browser input", () => {
    const { runtime } = makeRuntime();
    const response = handleOAuthSpikeStart(
      new Request(
        "https://harness.example/api/bitrix24/oauth/start?portal=https://evil.example&domain=evil.example",
      ),
      runtime,
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(302);
    expect(location.origin).toBe("https://portal.example");
    expect(location.toString()).not.toContain("evil.example");
  });

  it("returns a sanitized success without credentials, provider payload or Bitrix user ID", async () => {
    const { runtime, logEntries } = makeRuntime();
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const code = "browser-must-not-see-authorization-code";
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=${code}`),
      runtime,
    );
    const responseText = await response.text();
    const logs = JSON.stringify(logEntries);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(JSON.parse(responseText)).toEqual({
      status: "success",
      memberIdMatches: true,
      portalOrigin: "https://portal.example",
      admission: "passed",
    });
    for (const sensitiveValue of [
      authorization.accessToken,
      authorization.refreshToken,
      authorization.userId ?? "",
      code,
      runtime.config.clientSecret,
    ]) {
      expect(responseText).not.toContain(sensitiveValue);
      expect(logs).not.toContain(sensitiveValue);
    }
  });

  it("rejects a member ID mismatch before current-user admission", async () => {
    const client = new FakeIdentityClient();
    client.authorization = { ...authorization, memberId: "b".repeat(32) };
    const { runtime } = makeRuntime(client);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      reasonCode: "portal_mismatch",
    });
    expect(client.getCurrentUser).not.toHaveBeenCalled();
  });

  it("consumes state before returning OAuth denied and rejects reuse", async () => {
    const { runtime, client } = makeRuntime();
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const denied = await handleOAuthSpikeCallback(
      new Request(
        `https://harness.example/api/bitrix24/oauth/callback?state=${state}&error=access_denied&error_description=provider-secret`,
      ),
      runtime,
    );
    const reused = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );

    await expect(denied.json()).resolves.toEqual({ status: "error", reasonCode: "oauth_denied" });
    await expect(reused.json()).resolves.toEqual({ status: "error", reasonCode: "reused_state" });
    expect(client.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("never exchanges a code for invalid or expired state", async () => {
    const client = new FakeIdentityClient();
    const { runtime } = makeRuntime(client);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");

    const invalid = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${"z".repeat(43)}&code=code`),
      runtime,
    );

    let now = 1_000;
    const expiringRuntime: OAuthSpikeUserRuntime = {
      ...runtime,
      stateStore: new EphemeralOAuthStateStore({ ttlMs: 50, now: () => now }),
    };
    const expiredState = expiringRuntime.stateStore.issue();
    now = 1_051;
    const expired = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${expiredState}&code=code`),
      expiringRuntime,
    );

    await expect(invalid.json()).resolves.toMatchObject({ reasonCode: "invalid_state" });
    await expect(expired.json()).resolves.toMatchObject({ reasonCode: "expired_state" });
    expect(client.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it("returns safe admission denials", async () => {
    for (const [currentUser, reasonCode] of [
      [{ id: "1", active: false, userType: "employee" }, "inactive_user"],
      [{ id: "2", active: true, userType: "extranet" }, "external_user"],
      [{ id: "3", active: true, userType: "email" }, "external_user"],
      [{ id: "4", active: true, userType: "unexpected" }, "unknown_user_type"],
    ] as const) {
      const client = new FakeIdentityClient();
      client.currentUser = currentUser;
      client.authorization = { ...authorization, userId: currentUser.id };
      const { runtime } = makeRuntime(client);
      if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
      const state = runtime.stateStore.issue();
      const response = await handleOAuthSpikeCallback(
        new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
        runtime,
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ status: "error", reasonCode });
    }
  });

  it("sanitizes provider failures", async () => {
    const client = new FakeIdentityClient();
    client.exchangeError = new Error("provider payload with access-token and secret-code");
    const { runtime, logEntries } = makeRuntime(client);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=secret-code`),
      runtime,
    );
    const responseText = await response.text();
    const logs = JSON.stringify(logEntries);

    expect(JSON.parse(responseText)).toEqual({
      status: "error",
      reasonCode: "provider_unavailable",
    });
    expect(responseText + logs).not.toContain("provider payload");
    expect(responseText + logs).not.toContain("secret-code");
  });

  it("rejects provider user identity mismatch", async () => {
    const client = new FakeIdentityClient();
    client.currentUser = { id: "different-user", active: true, userType: "employee" };
    const { runtime } = makeRuntime(client);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      reasonCode: "provider_identity_mismatch",
    });
  });

  it("parses a realistic ONAPPINSTALL payload and returns only a general success", async () => {
    const { runtime, logEntries } = makeInstallRuntime();
    const payload = new URLSearchParams({
      event: "ONAPPINSTALL",
      "auth[access_token]": "installer-access-token",
      "auth[refresh_token]": "installer-refresh-token",
      "auth[member_id]": expectedMemberId,
      "auth[client_endpoint]": "https://portal.example/rest/",
      "auth[domain]": "portal.example",
      "auth[scope]": "user_brief",
      "auth[expires_in]": "3600",
      "auth[application_token]": "installer-application-token",
    });
    const response = await handleOAuthSpikeInstall(
      new Request("https://harness.example/api/bitrix24/oauth/install", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload,
      }),
      runtime,
    );
    const responseText = await response.text();
    const logs = JSON.stringify(logEntries);

    expect(JSON.parse(responseText)).toEqual({ status: "success" });
    expect(logs).toContain(expectedMemberId);
    expect(logs).toContain("https://portal.example");
    expect(responseText + logs).not.toContain("installer-access-token");
    expect(responseText + logs).not.toContain("installer-refresh-token");
    expect(responseText + logs).not.toContain("installer-application-token");
    expect(responseText).not.toContain("user_brief");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each([
    new URLSearchParams({
      event: "OTHER_EVENT",
      "auth[access_token]": "access",
      "auth[refresh_token]": "refresh",
      "auth[member_id]": expectedMemberId,
      "auth[client_endpoint]": "https://portal.example/rest/",
    }),
    new URLSearchParams({ event: "ONAPPINSTALL" }),
    new URLSearchParams({
      event: "ONAPPINSTALL",
      "auth[access_token]": "access",
      "auth[refresh_token]": "refresh",
      "auth[member_id]": "invalid",
      "auth[client_endpoint]": "https://portal.example/rest/",
    }),
  ])("rejects a wrong event or invalid auth bracket fields", async (payload) => {
    const { runtime, logEntries } = makeInstallRuntime();
    const response = await handleOAuthSpikeInstall(
      new Request("https://harness.example/api/bitrix24/oauth/install", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload,
      }),
      runtime,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      reasonCode: "invalid_install_payload",
    });
    expect(logEntries).toEqual([]);
  });

  it("keeps every spike route unavailable when the runtime is disabled", async () => {
    const disabled: OAuthSpikeUserRuntime = { status: "disabled" };
    const disabledInstall: OAuthSpikeInstallRuntime = { status: "disabled" };
    const start = handleOAuthSpikeStart(
      new Request("https://harness.example/api/bitrix24/oauth/start"),
      disabledInstall,
    );
    const callback = await handleOAuthSpikeCallback(
      new Request("https://harness.example/api/bitrix24/oauth/callback"),
      disabled,
    );
    const install = await handleOAuthSpikeInstall(
      new Request("https://harness.example/api/bitrix24/oauth/install", { method: "POST" }),
      disabled,
    );

    expect([start.status, callback.status, install.status]).toEqual([404, 404, 404]);
  });

  it("bootstraps install with only the dev flag and keeps actual routes closed otherwise", async () => {
    const { POST: installRoute } = await import("@/app/api/bitrix24/oauth/install/route");
    const { GET: startRoute } = await import("@/app/api/bitrix24/oauth/start/route");
    const { GET: callbackRoute } = await import("@/app/api/bitrix24/oauth/callback/route");
    const payload = new URLSearchParams({
      event: "ONAPPINSTALL",
      "auth[access_token]": "bootstrap-access",
      "auth[refresh_token]": "bootstrap-refresh",
      "auth[member_id]": expectedMemberId,
      "auth[client_endpoint]": "https://portal.example/rest/",
    });

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BITRIX24_OAUTH_SPIKE_ENABLED", "true");
    const install = await installRoute(
      new Request("https://harness.example/api/bitrix24/oauth/install", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: payload,
      }),
    );
    expect(install.status).toBe(200);

    vi.stubEnv("NODE_ENV", "production");
    const productionStatuses = await Promise.all([
      Promise.resolve(startRoute(new Request("https://harness.example/api/bitrix24/oauth/start"))).then(
        (response) => response.status,
      ),
      callbackRoute(new Request("https://harness.example/api/bitrix24/oauth/callback")).then(
        (response) => response.status,
      ),
      installRoute(
        new Request("https://harness.example/api/bitrix24/oauth/install", { method: "POST" }),
      ).then((response) => response.status),
    ]);
    expect(productionStatuses).toEqual([404, 404, 404]);

    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BITRIX24_OAUTH_SPIKE_ENABLED", "false");
    expect(
      startRoute(
        new Request("https://harness.example/api/bitrix24/oauth/start?BITRIX24_OAUTH_SPIKE_ENABLED=true", {
          headers: {
            Cookie: "BITRIX24_OAUTH_SPIKE_ENABLED=true",
            "X-Bitrix24-OAuth-Spike-Enabled": "true",
          },
        }),
      ).status,
    ).toBe(404);
    expect(
      await installRoute(
        new Request("https://harness.example/api/bitrix24/oauth/install", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ BITRIX24_OAUTH_SPIKE_ENABLED: "true" }),
        }),
      ),
    ).toMatchObject({ status: 404 });
  });

  it("preserves explicit safe provider reason codes", async () => {
    const client = new FakeIdentityClient();
    client.exchangeError = new OAuthSpikeError("token_exchange_failed");
    const { runtime } = makeRuntime(client);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );

    await expect(response.json()).resolves.toEqual({
      status: "error",
      reasonCode: "token_exchange_failed",
    });
  });
});

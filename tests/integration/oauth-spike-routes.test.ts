import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Bitrix24CurrentUser,
  Bitrix24IdentityClient,
  Bitrix24OAuthResult,
} from "@/integrations/bitrix24/identity-client";
import { OAuthSpikeError } from "@/integrations/bitrix24/spike/errors";
import type {
  OAuthSpikeHttpResponse,
  OAuthSpikeHttpTransport,
} from "@/integrations/bitrix24/spike/http-transport";
import { SpikeBitrix24IdentityClient } from "@/integrations/bitrix24/spike/spike-identity-client";
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
  scope: ["app"],
  userId: "browser-must-not-see-user-id",
};
const refreshedAuthorization: Bitrix24OAuthResult = {
  ...authorization,
  accessToken: "browser-must-not-see-rotated-access-token",
  refreshToken: "browser-must-not-see-rotated-refresh-token",
};

type LogDetails = Record<string, boolean | number | string | readonly string[]>;
type LogEntry = { event: string; details: LogDetails };

function tokenResponse(scope: unknown, suffix: string) {
  return {
    access_token: `browser-must-not-see-${suffix}-access-token`,
    refresh_token: `browser-must-not-see-${suffix}-refresh-token`,
    member_id: expectedMemberId,
    client_endpoint: "https://portal.example/rest/",
    expires_in: 3600,
    scope,
    user_id: "browser-must-not-see-provider-user",
  };
}

class QueueTransport implements OAuthSpikeHttpTransport {
  readonly calls: Array<{ url: string; body: URLSearchParams }> = [];

  constructor(private readonly responses: OAuthSpikeHttpResponse[]) {}

  async postForm(url: URL, body: URLSearchParams): Promise<OAuthSpikeHttpResponse> {
    this.calls.push({ url: url.toString(), body: new URLSearchParams(body) });
    const response = this.responses.shift();
    if (!response) throw new Error("No fake response");
    return response;
  }
}

class FakeIdentityClient implements Bitrix24IdentityClient {
  authorization = authorization;
  refreshedAuthorization = refreshedAuthorization;
  currentUser: Bitrix24CurrentUser = {
    id: "browser-must-not-see-user-id",
    active: true,
    userType: "employee",
  };
  exchangeError?: unknown;
  refreshError?: unknown;
  applicationPermissions = ["user_brief"];
  readonly exchangeAuthorizationCode = vi.fn(async () => {
    if (this.exchangeError) throw this.exchangeError;
    return this.authorization;
  });
  readonly refreshTokenPair = vi.fn(async () => {
    if (this.refreshError) throw this.refreshError;
    return this.refreshedAuthorization;
  });
  readonly getApplicationPermissions = vi.fn(async () => this.applicationPermissions);
  readonly getCurrentUser = vi.fn(async () => this.currentUser);

  createAuthorizationUrl(input: { state: string; redirectUri: string }): string {
    const url = new URL("https://portal.example/oauth/authorize/");
    url.searchParams.set("client_id", "local.test");
    url.searchParams.set("state", input.state);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return url.toString();
  }
}

function makeRuntime(client: Bitrix24IdentityClient = new FakeIdentityClient()) {
  const logEntries: LogEntry[] = [];
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
      tokenScopeHypothesis: "app",
      permissionHypothesis: "user_brief",
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

function makeDiagnosticRuntime(responses: OAuthSpikeHttpResponse[]) {
  const logEntries: LogEntry[] = [];
  const transport = new QueueTransport(responses);
  const logger = {
    info(event: string, details: LogDetails) {
      logEntries.push({ event, details });
    },
  };
  const client = new SpikeBitrix24IdentityClient(
    {
      portalOrigin: "https://portal.example",
      clientId: "local.test",
      clientSecret: "browser-must-not-see-client-secret",
      redirectUri: "https://harness.example/api/bitrix24/oauth/callback",
      tokenScopeHypothesis: "app",
      permissionHypothesis: "user_brief",
      tokenEndpoint: "https://oauth.bitrix.info/oauth/token/",
    },
    transport,
    (diagnostic) => logger.info("bitrix24_oauth_spike_scope_diagnostic", { ...diagnostic }),
    (diagnostic) => logger.info("bitrix24_oauth_spike_permission_diagnostic", { ...diagnostic }),
  );
  const { runtime } = makeRuntime(client);
  if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
  const diagnosticRuntime: OAuthSpikeUserRuntime = { ...runtime, logger };
  return { runtime: diagnosticRuntime, transport, logEntries };
}

function makeInstallRuntime() {
  const logEntries: LogEntry[] = [];
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

  it("refreshes once and returns a sanitized success without credential metadata", async () => {
    const { runtime, client, logEntries } = makeRuntime();
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
      refreshVerified: true,
    });
    expect(client.refreshTokenPair).toHaveBeenCalledOnce();
    expect(client.refreshTokenPair).toHaveBeenCalledWith({
      refreshToken: authorization.refreshToken,
    });
    expect(client.getApplicationPermissions).toHaveBeenCalledWith({
      accessToken: refreshedAuthorization.accessToken,
      clientEndpoint: refreshedAuthorization.clientEndpoint,
    });
    expect(client.getCurrentUser).toHaveBeenCalledWith({
      accessToken: refreshedAuthorization.accessToken,
      clientEndpoint: refreshedAuthorization.clientEndpoint,
    });
    expect(responseText).not.toContain("user_brief");
    expect(logs).toContain('"tokenScopeHypothesis":"app"');
    expect(logs).toContain('"actualTokenScopes":"app"');
    expect(logs).toContain('"permissionHypothesis":"user_brief"');
    expect(logs).toContain('"actualPermissions":"user_brief"');
    for (const sensitiveValue of [
      authorization.accessToken,
      authorization.refreshToken,
      refreshedAuthorization.accessToken,
      refreshedAuthorization.refreshToken,
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
    expect(client.refreshTokenPair).not.toHaveBeenCalled();
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
    expect(client.refreshTokenPair).not.toHaveBeenCalled();
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
    expect(client.refreshTokenPair).not.toHaveBeenCalled();
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
      client.refreshedAuthorization = { ...refreshedAuthorization, userId: currentUser.id };
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
    expect(client.refreshTokenPair).not.toHaveBeenCalled();
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

  it.each([
    [{ memberId: "b".repeat(32) }, "portal_mismatch"],
    [{ clientEndpoint: "https://renamed.example/rest/" }, "portal_origin_mismatch"],
    [{ scope: ["user"] }, "oauth_metadata_drift"],
    [{ expiresIn: undefined, expiresAt: undefined }, "oauth_metadata_drift"],
    [{ expiresIn: 0 }, "oauth_metadata_drift"],
    [{ userId: "different-provider-user" }, "provider_identity_mismatch"],
  ])("blocks refreshed authorization drift: %s", async (override, reasonCode) => {
    const client = new FakeIdentityClient();
    client.refreshedAuthorization = { ...refreshedAuthorization, ...override };
    const { runtime } = makeRuntime(client);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );

    await expect(response.json()).resolves.toEqual({ status: "error", reasonCode });
    expect(client.refreshTokenPair).toHaveBeenCalledOnce();
    expect(client.getApplicationPermissions).not.toHaveBeenCalled();
    expect(client.getCurrentUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ scope: [] }, "oauth_metadata_drift"],
    [{ expiresIn: undefined, expiresAt: undefined }, "oauth_metadata_drift"],
    [{ expiresIn: 0 }, "oauth_metadata_drift"],
  ])("blocks invalid initial authorization metadata: %s", async (override, reasonCode) => {
    const client = new FakeIdentityClient();
    client.authorization = { ...authorization, ...override };
    const { runtime } = makeRuntime(client);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );

    await expect(response.json()).resolves.toEqual({ status: "error", reasonCode });
    expect(client.refreshTokenPair).not.toHaveBeenCalled();
    expect(client.getCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects a missing initial scope hypothesis before refresh and admission", async () => {
    const client = new FakeIdentityClient();
    client.authorization = { ...authorization, scope: ["basic", "user_brief"] };
    const { runtime, logEntries } = makeRuntime(client);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );
    const responseText = await response.text();

    expect(JSON.parse(responseText)).toEqual({
      status: "error",
      reasonCode: "scope_hypothesis_mismatch",
    });
    expect(responseText).not.toContain("app");
    expect(responseText).not.toContain("basic");
    expect(client.refreshTokenPair).not.toHaveBeenCalled();
    expect(client.getApplicationPermissions).not.toHaveBeenCalled();
    expect(client.getCurrentUser).not.toHaveBeenCalled();
    expect(JSON.stringify(logEntries)).not.toContain(authorization.accessToken);
  });

  it("logs a sanitized initial scope mismatch before refresh", async () => {
    const initialResponse = tokenResponse(" basic user_brief ", "initial");
    const { runtime, transport, logEntries } = makeDiagnosticRuntime([
      { ok: true, status: 200, body: initialResponse },
    ]);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const code = "browser-must-not-see-authorization-code";
    const callbackUrl = `https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=${code}`;
    const response = await handleOAuthSpikeCallback(new Request(callbackUrl), runtime);
    const diagnostics = logEntries.filter((entry) => entry.event === "bitrix24_oauth_spike_scope_diagnostic");

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      reasonCode: "scope_hypothesis_mismatch",
    });
    expect(transport.calls).toHaveLength(1);
    expect(diagnostics).toEqual([
      {
        event: "bitrix24_oauth_spike_scope_diagnostic",
        details: {
          stage: "initial",
          scopePresent: true,
          scopeType: "string",
          normalizedScopeCount: 2,
          normalizedScopes: ["basic", "user_brief"],
          tokenScopeHypothesis: "app",
          hypothesisMatched: false,
        },
      },
    ]);
    const diagnosticLogs = JSON.stringify(diagnostics);
    for (const sensitiveValue of [
      initialResponse.access_token,
      initialResponse.refresh_token,
      initialResponse.user_id,
      code,
      state,
      runtime.config.clientSecret,
      callbackUrl,
      JSON.stringify(initialResponse),
    ]) {
      expect(diagnosticLogs).not.toContain(sensitiveValue);
    }
  });

  it("logs separate initial and refresh diagnostics on a successful callback", async () => {
    const initialResponse = tokenResponse("app,basic", "initial");
    const refreshResponse = tokenResponse(" basic app ", "refresh");
    const { runtime, transport, logEntries } = makeDiagnosticRuntime([
      { ok: true, status: 200, body: initialResponse },
      { ok: true, status: 200, body: refreshResponse },
      { ok: true, status: 200, body: { result: ["user_brief"] } },
      {
        ok: true,
        status: 200,
        body: {
          result: {
            ID: "browser-must-not-see-provider-user",
            ACTIVE: true,
            USER_TYPE: "employee",
          },
        },
      },
    ]);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(
        `https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=browser-must-not-see-code`,
      ),
      runtime,
    );
    const diagnostics = logEntries.filter((entry) => entry.event === "bitrix24_oauth_spike_scope_diagnostic");
    const permissionDiagnostics = logEntries.filter(
      (entry) => entry.event === "bitrix24_oauth_spike_permission_diagnostic",
    );

    expect(response.status).toBe(200);
    expect(transport.calls).toHaveLength(4);
    expect(diagnostics.map((entry) => entry.details)).toEqual([
      {
        stage: "initial",
        scopePresent: true,
        scopeType: "string",
        normalizedScopeCount: 2,
        normalizedScopes: ["app", "basic"],
        tokenScopeHypothesis: "app",
        hypothesisMatched: true,
      },
      {
        stage: "refresh",
        scopePresent: true,
        scopeType: "string",
        normalizedScopeCount: 2,
        normalizedScopes: ["app", "basic"],
        tokenScopeHypothesis: "app",
        hypothesisMatched: true,
      },
    ]);
    expect(permissionDiagnostics.map((entry) => entry.details)).toEqual([
      {
        stage: "post_refresh",
        permissionPresent: true,
        permissionResponseType: "array",
        normalizedPermissionCount: 1,
        normalizedPermissions: ["user_brief"],
        permissionHypothesis: "user_brief",
        hypothesisMatched: true,
      },
    ]);
    expect(transport.calls[2]?.url).toBe("https://portal.example/rest/scope");
    expect(transport.calls[2]?.body.get("auth")).toBe(refreshResponse.access_token);
    expect(transport.calls[3]?.url).toBe("https://portal.example/rest/user.current");
    expect(transport.calls[3]?.body.get("auth")).toBe(refreshResponse.access_token);
    const safePermissionLog = JSON.stringify(permissionDiagnostics);
    for (const forbiddenValue of [
      initialResponse.access_token,
      initialResponse.refresh_token,
      refreshResponse.access_token,
      refreshResponse.refresh_token,
      refreshResponse.user_id,
      runtime.config.clientSecret,
      runtime.config.portalOrigin,
      refreshResponse.client_endpoint,
      JSON.stringify(refreshResponse),
    ]) {
      expect(safePermissionLog).not.toContain(forbiddenValue);
    }
  });

  it("stops before user admission when the application permission hypothesis is missing", async () => {
    const client = new FakeIdentityClient();
    client.applicationPermissions = ["app", "user"];
    const { runtime, logEntries } = makeRuntime(client);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      reasonCode: "permission_hypothesis_mismatch",
    });
    expect(client.refreshTokenPair).toHaveBeenCalledOnce();
    expect(client.getApplicationPermissions).toHaveBeenCalledWith({
      accessToken: refreshedAuthorization.accessToken,
      clientEndpoint: refreshedAuthorization.clientEndpoint,
    });
    expect(client.getCurrentUser).not.toHaveBeenCalled();
    expect(JSON.stringify(logEntries)).not.toContain(refreshedAuthorization.accessToken);
  });

  it("stops before user admission when the application permission response is malformed", async () => {
    const initialResponse = tokenResponse("app", "malformed-initial");
    const refreshResponse = tokenResponse("app", "malformed-refresh");
    const malformedPermissionResponse = { result: ["user_brief", 123], time: {} };
    const { runtime, transport, logEntries } = makeDiagnosticRuntime([
      { ok: true, status: 200, body: initialResponse },
      { ok: true, status: 200, body: refreshResponse },
      { ok: true, status: 200, body: malformedPermissionResponse },
    ]);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const code = "browser-must-not-see-malformed-code";
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=${code}`),
      runtime,
    );
    const responseBody = await response.json();
    const logs = JSON.stringify(logEntries);

    expect(response.status).toBe(502);
    expect(responseBody).toEqual({ status: "error", reasonCode: "provider_unavailable" });
    expect(responseBody).not.toMatchObject({ reasonCode: "permission_hypothesis_mismatch" });
    expect(transport.calls).toHaveLength(3);
    expect(transport.calls.map((call) => call.url)).toEqual([
      "https://oauth.bitrix.info/oauth/token/",
      "https://oauth.bitrix.info/oauth/token/",
      "https://portal.example/rest/scope",
    ]);
    expect(transport.calls.some((call) => call.url.endsWith("/user.current"))).toBe(false);
    expect(transport.calls.some((call) => call.url.endsWith("/user.get"))).toBe(false);
    expect(logEntries.at(-1)).toEqual({
      event: "bitrix24_oauth_spike_callback",
      details: { status: "error", reasonCode: "provider_unavailable" },
    });
    for (const sensitiveValue of [
      initialResponse.access_token,
      initialResponse.refresh_token,
      refreshResponse.access_token,
      refreshResponse.refresh_token,
      initialResponse.user_id,
      refreshResponse.user_id,
      code,
      state,
      runtime.config.clientSecret,
      JSON.stringify(malformedPermissionResponse),
    ]) {
      expect(logs).not.toContain(sensitiveValue);
    }
  });

  it("logs refresh diagnostics before rejecting scope drift", async () => {
    const { runtime, transport, logEntries } = makeDiagnosticRuntime([
      { ok: true, status: 200, body: tokenResponse("app,basic", "initial") },
      { ok: true, status: 200, body: tokenResponse("app", "refresh") },
    ]);
    if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
    const state = runtime.stateStore.issue();
    const response = await handleOAuthSpikeCallback(
      new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
      runtime,
    );
    const diagnostics = logEntries.filter((entry) => entry.event === "bitrix24_oauth_spike_scope_diagnostic");

    await expect(response.json()).resolves.toEqual({
      status: "error",
      reasonCode: "oauth_metadata_drift",
    });
    expect(transport.calls).toHaveLength(2);
    expect(diagnostics.map((entry) => entry.details.stage)).toEqual(["initial", "refresh"]);
    expect(diagnostics[0]?.details.hypothesisMatched).toBe(true);
    expect(diagnostics[1]?.details).toMatchObject({
      normalizedScopes: ["app"],
      hypothesisMatched: true,
    });
  });

  it.each([
    [{ userId: "provider-user" }, { userId: undefined }],
    [{ userId: undefined }, { userId: "provider-user" }],
  ] as const)(
    "requires current user to match every available initial or refresh provider ID",
    async (initialOverride, refreshOverride) => {
      const client = new FakeIdentityClient();
      client.authorization = { ...authorization, ...initialOverride };
      client.refreshedAuthorization = { ...refreshedAuthorization, ...refreshOverride };
      client.currentUser = { id: "different-user", active: true, userType: "employee" };
      const { runtime } = makeRuntime(client);
      if (runtime.status !== "enabled") throw new Error("Expected enabled runtime");
      const state = runtime.stateStore.issue();
      const response = await handleOAuthSpikeCallback(
        new Request(`https://harness.example/api/bitrix24/oauth/callback?state=${state}&code=code`),
        runtime,
      );

      await expect(response.json()).resolves.toEqual({
        status: "error",
        reasonCode: "provider_identity_mismatch",
      });
    },
  );

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

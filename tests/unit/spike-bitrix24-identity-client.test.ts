import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyOAuthSpikePortalIdentity } from "@/integrations/bitrix24/spike/portal-identity";
import type {
  OAuthSpikeHttpResponse,
  OAuthSpikeHttpTransport,
} from "@/integrations/bitrix24/spike/http-transport";
import { FetchOAuthSpikeHttpTransport } from "@/integrations/bitrix24/spike/http-transport";
import {
  type OAuthSpikeScopeDiagnostic,
  SpikeBitrix24IdentityClient,
} from "@/integrations/bitrix24/spike/spike-identity-client";

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

const config = {
  portalOrigin: "https://portal.example",
  clientId: "local.test",
  clientSecret: "synthetic-client-secret",
  redirectUri: "https://harness.example/api/bitrix24/oauth/callback",
  scopeHypothesis: "user_brief" as const,
  tokenEndpoint: "https://oauth.bitrix.info/oauth/token/",
};

const tokenBody = {
  access_token: "synthetic-access-token",
  refresh_token: "synthetic-refresh-token",
  expires: 1_800_000_000,
  expires_in: 3600,
  member_id: "a".repeat(32),
  client_endpoint: "https://portal.example/rest/",
  domain: "oauth.bitrix.info",
  scope: "user_brief,basic",
  user_id: 7,
};

async function captureScopeDiagnostic(scope: unknown, scopePresent = true) {
  const body: Record<string, unknown> = { ...tokenBody };
  if (scopePresent) body.scope = scope;
  else delete body.scope;
  const diagnostics: OAuthSpikeScopeDiagnostic[] = [];
  const client = new SpikeBitrix24IdentityClient(
    config,
    new QueueTransport([{ ok: true, status: 200, body }]),
    (diagnostic) => diagnostics.push(diagnostic),
  );

  await client
    .exchangeAuthorizationCode({ code: "synthetic-code", redirectUri: config.redirectUri })
    .catch(() => undefined);

  return diagnostics[0];
}

describe("SpikeBitrix24IdentityClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses only the configured portal for authorization", () => {
    const client = new SpikeBitrix24IdentityClient(config, new QueueTransport([]));
    const result = new URL(
      client.createAuthorizationUrl({ state: "state", redirectUri: config.redirectUri }),
    );

    expect(result.origin).toBe("https://portal.example");
    expect(result.searchParams.get("client_id")).toBe("local.test");
    expect(result.searchParams.get("state")).toBe("state");
    expect(result.searchParams.get("scope")).toBeNull();
    expect(result.searchParams.get("client_secret")).toBeNull();
    expect(result.searchParams.get("redirect_uri")).toBeNull();
    expect([...result.searchParams.keys()].sort()).toEqual(["client_id", "state"]);
    expect(result.toString()).not.toContain(config.clientSecret);
  });

  it("normalizes exchange and refresh identity metadata without trusting domain", async () => {
    const transport = new QueueTransport([
      { ok: true, status: 200, body: tokenBody },
      {
        ok: true,
        status: 200,
        body: {
          ...tokenBody,
          access_token: "rotated-access-token",
          refresh_token: "rotated-refresh-token",
          client_endpoint: "https://renamed.example/rest/",
        },
      },
    ]);
    const client = new SpikeBitrix24IdentityClient(config, transport);
    const exchange = await client.exchangeAuthorizationCode({
      code: "synthetic-code",
      redirectUri: config.redirectUri,
    });
    const refresh = await client.refreshTokenPair({ refreshToken: exchange.refreshToken });

    expect(exchange).toMatchObject({
      memberId: "a".repeat(32),
      clientEndpoint: "https://portal.example/rest/",
      expiresAt: 1_800_000_000,
      expiresIn: 3600,
      scope: ["basic", "user_brief"],
      userId: "7",
    });
    expect(exchange).not.toHaveProperty("domain");
    expect(() => verifyOAuthSpikePortalIdentity(refresh, "a".repeat(32), config.portalOrigin)).toThrowError(
      expect.objectContaining({ reasonCode: "portal_origin_mismatch" }),
    );
    expect(transport.calls[0]?.body.get("code")).toBe("synthetic-code");
    expect(transport.calls[1]?.body.get("refresh_token")).toBe("synthetic-refresh-token");
  });

  it.each([
    ["commas", "user_brief,basic", ["basic", "user_brief"]],
    ["whitespace", "user_brief basic", ["basic", "user_brief"]],
    ["mixed separators", " user_brief,\t basic\nuser_brief ", ["basic", "user_brief"]],
  ])("diagnoses and normalizes scopes separated by %s", async (_label, rawScope, expectedScopes) => {
    await expect(captureScopeDiagnostic(rawScope)).resolves.toEqual({
      stage: "initial",
      scopePresent: true,
      scopeType: "string",
      normalizedScopeCount: expectedScopes.length,
      normalizedScopes: expectedScopes,
      hypothesis: "user_brief",
      hypothesisMatched: true,
    });
  });

  it("preserves scope case and compares the hypothesis case-sensitively", async () => {
    await expect(captureScopeDiagnostic("USER_BRIEF,user_brief")).resolves.toMatchObject({
      normalizedScopeCount: 2,
      normalizedScopes: ["USER_BRIEF", "user_brief"],
      hypothesisMatched: true,
    });
    await expect(captureScopeDiagnostic("USER_BRIEF")).resolves.toMatchObject({
      normalizedScopes: ["USER_BRIEF"],
      hypothesisMatched: false,
    });
  });

  it.each([
    ["missing", undefined, false, "missing"],
    ["empty string", "", true, "string"],
    ["null", null, true, "null"],
    ["array", ["user_brief"], true, "array"],
    ["number", 1, true, "number"],
    ["object", { value: "user_brief" }, true, "object"],
    ["boolean", true, true, "boolean"],
  ])("classifies a %s scope without logging a raw value", async (_label, value, present, scopeType) => {
    await expect(captureScopeDiagnostic(value, present)).resolves.toEqual({
      stage: "initial",
      scopePresent: present,
      scopeType,
      normalizedScopeCount: 0,
      normalizedScopes: [],
      hypothesis: "user_brief",
      hypothesisMatched: false,
    });
  });

  it("omits unsafe and overlong names from diagnostic scopes", async () => {
    await expect(captureScopeDiagnostic(`user_brief,bad=value,${"x".repeat(65)}`)).resolves.toMatchObject({
      normalizedScopeCount: 3,
      normalizedScopes: ["user_brief"],
      hypothesisMatched: true,
    });
  });

  it("omits the complete diagnostic list when the normalized scope count exceeds the limit", async () => {
    const excessiveScopes = Array.from({ length: 33 }, (_, index) => `scope_${index}`).join(",");

    await expect(captureScopeDiagnostic(excessiveScopes)).resolves.toMatchObject({
      normalizedScopeCount: 33,
      normalizedScopes: [],
      hypothesisMatched: false,
    });
  });

  it("uses user.get only when user.current lacks USER_TYPE", async () => {
    const transport = new QueueTransport([
      { ok: true, status: 200, body: tokenBody },
      { ok: true, status: 200, body: { result: { ID: "7", ACTIVE: true } } },
      {
        ok: true,
        status: 200,
        body: { result: [{ ID: "7", ACTIVE: "Y", USER_TYPE: "employee" }] },
      },
    ]);
    const client = new SpikeBitrix24IdentityClient(config, transport);
    const tokens = await client.exchangeAuthorizationCode({
      code: "synthetic-code",
      redirectUri: config.redirectUri,
    });

    await expect(
      client.getCurrentUser({
        accessToken: tokens.accessToken,
        clientEndpoint: tokens.clientEndpoint,
      }),
    ).resolves.toEqual({ id: "7", active: true, userType: "employee" });
    expect(transport.calls.map((call) => call.url)).toEqual([
      "https://oauth.bitrix.info/oauth/token/",
      "https://portal.example/rest/user.current",
      "https://portal.example/rest/user.get",
    ]);
  });

  it.each([undefined, ""])(
    "fails closed when user.current USER_TYPE is %s and fallback is empty",
    async (userType) => {
      const currentResult: Record<string, unknown> = { ID: "7", ACTIVE: true };
      if (userType !== undefined) currentResult.USER_TYPE = userType;
      const transport = new QueueTransport([
        { ok: true, status: 200, body: { result: currentResult } },
        { ok: true, status: 200, body: { result: [] } },
      ]);
      const client = new SpikeBitrix24IdentityClient(config, transport);

      await expect(
        client.getCurrentUser({
          accessToken: "synthetic-access-token",
          clientEndpoint: "https://portal.example/rest/",
        }),
      ).rejects.toMatchObject({ reasonCode: "provider_identity_mismatch" });
    },
  );

  it.each([
    [
      {
        result: [
          { ID: "7", ACTIVE: "Y", USER_TYPE: "employee" },
          { ID: "8", ACTIVE: "Y", USER_TYPE: "employee" },
        ],
      },
      "multiple users",
    ],
    [{ result: [{ ID: "8", ACTIVE: "Y", USER_TYPE: "employee" }] }, "a different ID"],
    [{ result: [{ ID: "7", ACTIVE: "N", USER_TYPE: "employee" }] }, "a different ACTIVE value"],
  ])("rejects fallback user.get returning %s", async (fallbackBody) => {
    const transport = new QueueTransport([
      { ok: true, status: 200, body: { result: { ID: "7", ACTIVE: true } } },
      { ok: true, status: 200, body: fallbackBody },
    ]);
    const client = new SpikeBitrix24IdentityClient(config, transport);

    await expect(
      client.getCurrentUser({
        accessToken: "synthetic-access-token",
        clientEndpoint: "https://portal.example/rest/",
      }),
    ).rejects.toMatchObject({ reasonCode: "provider_identity_mismatch" });
  });

  it("replaces provider errors with a safe reason code", async () => {
    const client = new SpikeBitrix24IdentityClient(
      config,
      new QueueTransport([
        {
          ok: false,
          status: 400,
          body: { error: "provider-error", access_token: "must-not-leak" },
        },
      ]),
    );

    await expect(
      client.exchangeAuthorizationCode({ code: "secret-code", redirectUri: config.redirectUri }),
    ).rejects.toMatchObject({ reasonCode: "token_exchange_failed" });
  });

  it("rejects malformed and oversized successful provider responses", async () => {
    const transport = new FetchOAuthSpikeHttpTransport();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not-json", { status: 200 })),
    );
    await expect(
      transport.postForm(new URL(config.tokenEndpoint), new URLSearchParams()),
    ).rejects.toMatchObject({ reasonCode: "provider_unavailable" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ result: "x".repeat(256 * 1024) }), { status: 200 })),
    );
    await expect(
      transport.postForm(new URL(config.tokenEndpoint), new URLSearchParams()),
    ).rejects.toMatchObject({ reasonCode: "provider_unavailable" });
  });

  it("does not parse an unsuccessful provider response", async () => {
    const transport = new FetchOAuthSpikeHttpTransport();
    const response = new Response("not-json-with-provider-secret", { status: 500 });
    const textSpy = vi.spyOn(response, "text");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response),
    );

    await expect(transport.postForm(new URL(config.tokenEndpoint), new URLSearchParams())).resolves.toEqual({
      ok: false,
      status: 500,
      body: null,
    });
    expect(textSpy).not.toHaveBeenCalled();
  });
});

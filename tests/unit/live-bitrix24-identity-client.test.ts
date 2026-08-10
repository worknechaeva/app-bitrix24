import { describe, expect, it } from "vitest";
import { Bitrix24AuthError } from "@/integrations/bitrix24/auth-errors";
import type { Bitrix24HttpResponse, Bitrix24HttpTransport } from "@/integrations/bitrix24/http-transport";
import {
  LiveBitrix24IdentityClient,
  normalizeBitrix24AccessTokenExpiry,
} from "@/integrations/bitrix24/live-identity-client";
import { parseProductionOAuthConfiguration } from "@/lib/env/production-oauth";

const config = parseProductionOAuthConfiguration({
  TASK_LAUNCHER_APP_ORIGIN: "https://launcher.example",
  BITRIX24_OAUTH_CLIENT_ID: "client-id",
  BITRIX24_OAUTH_CLIENT_SECRET: "secret",
  BITRIX24_PORTAL_MEMBER_ID: "a".repeat(32),
  BITRIX24_PORTAL_ORIGIN: "https://portal.example",
});

class QueueTransport implements Bitrix24HttpTransport {
  calls: Array<{ url: string; body: URLSearchParams }> = [];
  constructor(private readonly responses: Bitrix24HttpResponse[]) {}
  async postForm(url: URL, body: URLSearchParams): Promise<Bitrix24HttpResponse> {
    this.calls.push({ url: url.toString(), body: new URLSearchParams(body) });
    const response = this.responses.shift();
    if (!response) throw new Error("missing fake response");
    return response;
  }
}

function tokenBody(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "access",
    refresh_token: "refresh",
    member_id: "a".repeat(32),
    client_endpoint: "https://portal.example/rest/",
    expires_in: 3600,
    scope: "app user_brief",
    user_id: 42,
    ...overrides,
  };
}

describe("LiveBitrix24IdentityClient", () => {
  it("builds the portal authorization URL with a fixed callback", () => {
    const client = new LiveBitrix24IdentityClient(config, new QueueTransport([]));
    const url = new URL(client.createAuthorizationUrl({ state: "state", redirectUri: config.callbackUri }));
    expect(url.origin + url.pathname).toBe("https://portal.example/oauth/authorize/");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.callbackUri);
    expect(url.searchParams.get("state")).toBe("state");
  });

  it("exchanges code at the official endpoint and normalizes expiry", async () => {
    const transport = new QueueTransport([{ ok: true, status: 200, body: tokenBody() }]);
    const client = new LiveBitrix24IdentityClient(config, transport, () => 1_700_000_000_000);
    await expect(
      client.exchangeAuthorizationCode({ code: "code", redirectUri: config.callbackUri }),
    ).resolves.toMatchObject({
      memberId: "a".repeat(32),
      clientEndpoint: "https://portal.example/rest/",
      scope: ["app", "user_brief"],
      userId: "42",
      accessTokenExpiresAt: "2023-11-14T23:13:20.000Z",
    });
    expect(transport.calls[0]?.url).toBe("https://oauth.bitrix.info/oauth/token/");
    expect(transport.calls[0]?.body.get("client_secret")).toBe("secret");
    expect(transport.calls[0]?.body.get("redirect_uri")).toBe(config.callbackUri);
  });

  it("reads application permissions and current user with user.get fallback", async () => {
    const transport = new QueueTransport([
      { ok: true, status: 200, body: { result: ["user_brief", "tasks"] } },
      { ok: true, status: 200, body: { result: { ID: "42", ACTIVE: "Y" } } },
      { ok: true, status: 200, body: { result: [{ ID: "42", ACTIVE: true, USER_TYPE: "employee" }] } },
    ]);
    const client = new LiveBitrix24IdentityClient(config, transport);
    await expect(
      client.getApplicationPermissions({
        accessToken: "access",
        clientEndpoint: "https://portal.example/rest/",
      }),
    ).resolves.toEqual(["tasks", "user_brief"]);
    await expect(
      client.getCurrentUser({ accessToken: "access", clientEndpoint: "https://portal.example/rest/" }),
    ).resolves.toEqual({ id: "42", active: true, userType: "employee" });
    expect(transport.calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/rest/scope",
      "/rest/user.current",
      "/rest/user.get",
    ]);
  });

  it.each([
    { ok: false, status: 500, body: null },
    { ok: true, status: 200, body: { bad: true } },
    { ok: true, status: 200, body: tokenBody({ client_endpoint: "http://portal.example/rest/" }) },
    { ok: true, status: 200, body: tokenBody({ user_id: "../../42" }) },
  ] satisfies Bitrix24HttpResponse[])(
    "fails closed for provider failure or malformed token response",
    async (response) => {
      const client = new LiveBitrix24IdentityClient(config, new QueueTransport([response]));
      await expect(
        client.exchangeAuthorizationCode({ code: "code", redirectUri: config.callbackUri }),
      ).rejects.toBeInstanceOf(Bitrix24AuthError);
    },
  );

  it("rejects a mismatched user.get identity", async () => {
    const client = new LiveBitrix24IdentityClient(
      config,
      new QueueTransport([
        { ok: true, status: 200, body: { result: { ID: "42", ACTIVE: true } } },
        { ok: true, status: 200, body: { result: [{ ID: "43", ACTIVE: true, USER_TYPE: "employee" }] } },
      ]),
    );
    await expect(
      client.getCurrentUser({ accessToken: "access", clientEndpoint: "https://portal.example/rest/" }),
    ).rejects.toMatchObject({ reasonCode: "provider_identity_mismatch" });
  });
});

describe("Bitrix24 access-token expiry normalization", () => {
  it("uses confirmed Unix seconds for absolute expires", () => {
    expect(normalizeBitrix24AccessTokenExpiry({ expires: 1_700_000_000 }, 0)).toBe(
      "2023-11-14T22:13:20.000Z",
    );
  });

  it("allows absent optional expiry and rejects malformed values", () => {
    expect(normalizeBitrix24AccessTokenExpiry({})).toBeNull();
    expect(() => normalizeBitrix24AccessTokenExpiry({ expiresIn: 0 })).toThrow(Bitrix24AuthError);
    expect(() => normalizeBitrix24AccessTokenExpiry({ expires: 1.5 })).toThrow(Bitrix24AuthError);
    expect(() => normalizeBitrix24AccessTokenExpiry({ expires: 1_699_999_999 }, 1_700_000_000_000)).toThrow(
      Bitrix24AuthError,
    );
  });
});

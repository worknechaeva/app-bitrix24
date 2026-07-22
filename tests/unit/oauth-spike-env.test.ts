import { describe, expect, it } from "vitest";
import { parseOAuthSpikeInstallConfig, parseOAuthSpikeUserConfig } from "@/lib/env/oauth-spike";

const validEnvironment = {
  BITRIX24_OAUTH_SPIKE_ENABLED: "true",
  BITRIX24_OAUTH_SPIKE_APP_ORIGIN: "https://harness.example",
  BITRIX24_OAUTH_SPIKE_PORTAL_ORIGIN: "https://portal.example",
  BITRIX24_OAUTH_SPIKE_EXPECTED_MEMBER_ID: "a".repeat(32),
  BITRIX24_OAUTH_SPIKE_CLIENT_ID: "local.test",
  BITRIX24_OAUTH_SPIKE_CLIENT_SECRET: "synthetic-secret",
  BITRIX24_OAUTH_SPIKE_REDIRECT_URI: "https://harness.example/api/bitrix24/oauth/callback",
  BITRIX24_OAUTH_SPIKE_SCOPES: "user_brief",
  BITRIX24_OAUTH_SPIKE_TOKEN_ENDPOINT: "https://oauth.bitrix.info/oauth/token/",
};

describe("OAuth spike environment", () => {
  it("parses a server-only user OAuth configuration", () => {
    expect(parseOAuthSpikeUserConfig(validEnvironment, "development")).toMatchObject({
      enabled: true,
      portalOrigin: "https://portal.example",
      scopes: ["user_brief"],
    });
  });

  it("enables install bootstrap with only the exact dev/test flag", () => {
    expect(parseOAuthSpikeInstallConfig({ BITRIX24_OAUTH_SPIKE_ENABLED: "true" }, "development")).toEqual({
      enabled: true,
    });
    expect(parseOAuthSpikeInstallConfig({ BITRIX24_OAUTH_SPIKE_ENABLED: "true" }, "test")).toEqual({
      enabled: true,
    });
  });

  it("keeps both configurations closed in production", () => {
    expect(parseOAuthSpikeInstallConfig(validEnvironment, "production")).toEqual({
      enabled: false,
    });
    expect(parseOAuthSpikeUserConfig(validEnvironment, "production")).toEqual({ enabled: false });
  });

  it("keeps install bootstrap closed without an exact true flag", () => {
    expect(parseOAuthSpikeInstallConfig({}, "development")).toEqual({ enabled: false });
    expect(parseOAuthSpikeInstallConfig({ BITRIX24_OAUTH_SPIKE_ENABLED: "1" }, "development")).toEqual({
      enabled: false,
    });
  });

  it.each([
    { BITRIX24_OAUTH_SPIKE_SCOPES: "user_brief,tasks" },
    { BITRIX24_OAUTH_SPIKE_SCOPES: "crm" },
    { BITRIX24_OAUTH_SPIKE_REDIRECT_URI: "https://evil.example/api/bitrix24/oauth/callback" },
    { BITRIX24_OAUTH_SPIKE_TOKEN_ENDPOINT: "https://evil.example/oauth/token/" },
    { BITRIX24_OAUTH_SPIKE_PORTAL_ORIGIN: "https://portal.example:8443" },
  ])("rejects unsafe user OAuth configuration", (override) => {
    expect(() => parseOAuthSpikeUserConfig({ ...validEnvironment, ...override }, "development")).toThrowError(
      expect.objectContaining({ reasonCode: "invalid_configuration" }),
    );
  });
});

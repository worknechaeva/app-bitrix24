import { describe, expect, it } from "vitest";
import { Bitrix24AuthError } from "@/integrations/bitrix24/auth-errors";
import {
  BITRIX24_OAUTH_TOKEN_ENDPOINT,
  BITRIX24_REQUIRED_APPLICATION_PERMISSION,
  BITRIX24_REQUIRED_TOKEN_SCOPE,
  parseProductionOAuthConfiguration,
} from "@/lib/env/production-oauth";

const valid = {
  TASK_LAUNCHER_APP_ORIGIN: "https://launcher.example",
  BITRIX24_OAUTH_CLIENT_ID: "client-id",
  BITRIX24_OAUTH_CLIENT_SECRET: "secret-must-not-escape",
  BITRIX24_PORTAL_MEMBER_ID: "a".repeat(32),
  BITRIX24_PORTAL_ORIGIN: "https://portal.example",
};

describe("production OAuth configuration", () => {
  it("derives fixed provider semantics and callback from canonical server origins", () => {
    expect(parseProductionOAuthConfiguration(valid)).toEqual({
      appOrigin: "https://launcher.example",
      callbackUri: "https://launcher.example/api/bitrix24/oauth/callback",
      portalOrigin: "https://portal.example",
      expectedMemberId: "a".repeat(32),
      clientId: "client-id",
      clientSecret: "secret-must-not-escape",
      tokenEndpoint: BITRIX24_OAUTH_TOKEN_ENDPOINT,
      requiredTokenScope: BITRIX24_REQUIRED_TOKEN_SCOPE,
      requiredApplicationPermission: BITRIX24_REQUIRED_APPLICATION_PERMISSION,
    });
  });

  it.each([
    { ...valid, TASK_LAUNCHER_APP_ORIGIN: "http://launcher.example" },
    { ...valid, TASK_LAUNCHER_APP_ORIGIN: "https://launcher.example:8443" },
    { ...valid, TASK_LAUNCHER_APP_ORIGIN: "https://launcher.example/path" },
    { ...valid, TASK_LAUNCHER_APP_ORIGIN: "https://user:pass@launcher.example" },
    { ...valid, BITRIX24_OAUTH_CLIENT_SECRET: undefined },
    { ...valid, BITRIX24_PORTAL_MEMBER_ID: "wrong" },
  ])("fails closed without exposing malformed values", (environment) => {
    let thrown: unknown;
    try {
      parseProductionOAuthConfiguration(environment);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Bitrix24AuthError);
    expect(String(thrown)).not.toContain("secret-must-not-escape");
  });
});

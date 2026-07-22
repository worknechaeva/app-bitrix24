import "server-only";

import { z } from "zod";
import { canonicalPortalOriginFromConfiguredOrigin } from "@/integrations/bitrix24/portal-origin";
import { OAuthSpikeError } from "@/integrations/bitrix24/spike/errors";

const OFFICIAL_TOKEN_ENDPOINT = "https://oauth.bitrix.info/oauth/token/";
const ALLOWED_SCOPES = new Set(["basic", "user_brief"]);

export type OAuthSpikeInstallConfig = { enabled: true } | { enabled: false };

export type OAuthSpikeUserEnabledConfig = {
  enabled: true;
  appOrigin: string;
  portalOrigin: string;
  expectedMemberId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  tokenEndpoint: string;
};

export type OAuthSpikeUserConfig = OAuthSpikeUserEnabledConfig | { enabled: false };

type OAuthSpikeEnvironment = Record<string, string | undefined>;

const enabledEnvironmentSchema = z.object({
  BITRIX24_OAUTH_SPIKE_APP_ORIGIN: z.string().min(1),
  BITRIX24_OAUTH_SPIKE_PORTAL_ORIGIN: z.string().min(1),
  BITRIX24_OAUTH_SPIKE_EXPECTED_MEMBER_ID: z.string().regex(/^[a-f0-9]{32}$/i),
  BITRIX24_OAUTH_SPIKE_CLIENT_ID: z.string().min(1),
  BITRIX24_OAUTH_SPIKE_CLIENT_SECRET: z.string().min(1),
  BITRIX24_OAUTH_SPIKE_REDIRECT_URI: z.string().min(1),
  BITRIX24_OAUTH_SPIKE_SCOPES: z.string().min(1),
  BITRIX24_OAUTH_SPIKE_TOKEN_ENDPOINT: z.string().min(1),
});

function parseOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.hostname.endsWith(".") ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/"
  ) {
    throw new OAuthSpikeError("invalid_configuration");
  }
  return url.origin;
}

export function parseOAuthSpikeInstallConfig(
  environment: OAuthSpikeEnvironment,
  runtime: "development" | "test" | "production",
): OAuthSpikeInstallConfig {
  if (runtime === "production" || environment.BITRIX24_OAUTH_SPIKE_ENABLED !== "true") {
    return { enabled: false };
  }

  return { enabled: true };
}

export function parseOAuthSpikeUserConfig(
  environment: OAuthSpikeEnvironment,
  runtime: "development" | "test" | "production",
): OAuthSpikeUserConfig {
  if (!parseOAuthSpikeInstallConfig(environment, runtime).enabled) return { enabled: false };

  const parsed = enabledEnvironmentSchema.safeParse(environment);
  if (!parsed.success) throw new OAuthSpikeError("invalid_configuration");

  try {
    const appOrigin = parseOrigin(parsed.data.BITRIX24_OAUTH_SPIKE_APP_ORIGIN);
    const portalOrigin = canonicalPortalOriginFromConfiguredOrigin(
      parsed.data.BITRIX24_OAUTH_SPIKE_PORTAL_ORIGIN,
    );
    const redirectUri = new URL(parsed.data.BITRIX24_OAUTH_SPIKE_REDIRECT_URI);
    const scopes = parsed.data.BITRIX24_OAUTH_SPIKE_SCOPES.split(/[\s,]+/).filter(Boolean);

    if (
      redirectUri.protocol !== "https:" ||
      redirectUri.origin !== appOrigin ||
      redirectUri.username !== "" ||
      redirectUri.password !== "" ||
      redirectUri.search !== "" ||
      redirectUri.hash !== "" ||
      redirectUri.pathname !== "/api/bitrix24/oauth/callback" ||
      scopes.length === 0 ||
      scopes.some((scope) => !ALLOWED_SCOPES.has(scope)) ||
      parsed.data.BITRIX24_OAUTH_SPIKE_TOKEN_ENDPOINT !== OFFICIAL_TOKEN_ENDPOINT
    ) {
      throw new OAuthSpikeError("invalid_configuration");
    }

    return {
      enabled: true,
      appOrigin,
      portalOrigin,
      expectedMemberId: parsed.data.BITRIX24_OAUTH_SPIKE_EXPECTED_MEMBER_ID,
      clientId: parsed.data.BITRIX24_OAUTH_SPIKE_CLIENT_ID,
      clientSecret: parsed.data.BITRIX24_OAUTH_SPIKE_CLIENT_SECRET,
      redirectUri: redirectUri.toString(),
      scopes,
      tokenEndpoint: OFFICIAL_TOKEN_ENDPOINT,
    };
  } catch {
    throw new OAuthSpikeError("invalid_configuration");
  }
}

function getRuntime(): "development" | "test" | "production" {
  return z.enum(["development", "test", "production"]).parse(process.env.NODE_ENV);
}

export function getOAuthSpikeInstallConfig(): OAuthSpikeInstallConfig {
  return parseOAuthSpikeInstallConfig(process.env, getRuntime());
}

export function getOAuthSpikeUserConfig(): OAuthSpikeUserConfig {
  return parseOAuthSpikeUserConfig(process.env, getRuntime());
}

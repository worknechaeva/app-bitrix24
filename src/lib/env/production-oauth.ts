import "server-only";

import { z } from "zod";
import { Bitrix24AuthError } from "@/integrations/bitrix24/auth-errors";
import { canonicalPortalOriginFromConfiguredOrigin } from "@/integrations/bitrix24/portal-origin";

export const BITRIX24_OAUTH_TOKEN_ENDPOINT = "https://oauth.bitrix.info/oauth/token/";
export const BITRIX24_REQUIRED_TOKEN_SCOPE = "app";
export const BITRIX24_REQUIRED_APPLICATION_PERMISSION = "user_brief";
export const BITRIX24_OAUTH_CALLBACK_PATH = "/api/bitrix24/oauth/callback";

type ProductionOAuthEnvironment = Record<string, string | undefined>;

export type ProductionOAuthConfiguration = {
  appOrigin: string;
  callbackUri: string;
  portalOrigin: string;
  expectedMemberId: string;
  clientId: string;
  clientSecret: string;
  tokenEndpoint: typeof BITRIX24_OAUTH_TOKEN_ENDPOINT;
  requiredTokenScope: typeof BITRIX24_REQUIRED_TOKEN_SCOPE;
  requiredApplicationPermission: typeof BITRIX24_REQUIRED_APPLICATION_PERMISSION;
};

function parseHttpsOrigin(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.hostname.endsWith(".")
  ) {
    throw new Bitrix24AuthError("invalid_configuration");
  }
  return url.origin;
}

export function parseProductionOAuthConfiguration(
  environment: ProductionOAuthEnvironment,
): ProductionOAuthConfiguration {
  const parsed = z
    .object({
      TASK_LAUNCHER_APP_ORIGIN: z.string().min(1),
      BITRIX24_OAUTH_CLIENT_ID: z.string().min(1).max(512),
      BITRIX24_OAUTH_CLIENT_SECRET: z.string().min(1).max(4096),
      BITRIX24_PORTAL_MEMBER_ID: z.string().regex(/^[a-f0-9]{32}$/i),
      BITRIX24_PORTAL_ORIGIN: z.string().min(1),
    })
    .safeParse(environment);
  if (!parsed.success) throw new Bitrix24AuthError("invalid_configuration");

  try {
    const appOrigin = parseHttpsOrigin(parsed.data.TASK_LAUNCHER_APP_ORIGIN);
    const portalOrigin = canonicalPortalOriginFromConfiguredOrigin(parsed.data.BITRIX24_PORTAL_ORIGIN);
    return {
      appOrigin,
      callbackUri: `${appOrigin}${BITRIX24_OAUTH_CALLBACK_PATH}`,
      portalOrigin,
      expectedMemberId: parsed.data.BITRIX24_PORTAL_MEMBER_ID,
      clientId: parsed.data.BITRIX24_OAUTH_CLIENT_ID,
      clientSecret: parsed.data.BITRIX24_OAUTH_CLIENT_SECRET,
      tokenEndpoint: BITRIX24_OAUTH_TOKEN_ENDPOINT,
      requiredTokenScope: BITRIX24_REQUIRED_TOKEN_SCOPE,
      requiredApplicationPermission: BITRIX24_REQUIRED_APPLICATION_PERMISSION,
    };
  } catch (error) {
    if (error instanceof Bitrix24AuthError) throw error;
    throw new Bitrix24AuthError("invalid_configuration");
  }
}

export function getProductionOAuthConfiguration(): ProductionOAuthConfiguration {
  return parseProductionOAuthConfiguration(process.env);
}

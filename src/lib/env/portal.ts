import "server-only";

import { z } from "zod";
import { canonicalPortalOriginFromConfiguredOrigin } from "@/integrations/bitrix24/portal-origin";

type PortalEnvironment = Record<string, string | undefined>;

const configuredPortalSchema = z.object({
  BITRIX24_PORTAL_MEMBER_ID: z.string().regex(/^[a-f0-9]{32}$/i),
  BITRIX24_PORTAL_ORIGIN: z.string().min(1),
});

export type PortalConfiguration =
  | { configured: false }
  | {
      configured: true;
      memberId: string;
      portalOrigin: string;
    };

export class PortalConfigurationError extends Error {
  readonly code = "invalid_portal_configuration";

  constructor() {
    super("Invalid portal configuration");
    this.name = "PortalConfigurationError";
  }
}

export function parsePortalConfiguration(environment: PortalEnvironment): PortalConfiguration {
  const memberId = environment.BITRIX24_PORTAL_MEMBER_ID;
  const portalOrigin = environment.BITRIX24_PORTAL_ORIGIN;

  if ((memberId === undefined || memberId === "") && (portalOrigin === undefined || portalOrigin === "")) {
    return { configured: false };
  }

  const parsed = configuredPortalSchema.safeParse({
    BITRIX24_PORTAL_MEMBER_ID: memberId,
    BITRIX24_PORTAL_ORIGIN: portalOrigin,
  });

  if (!parsed.success) throw new PortalConfigurationError();

  try {
    return {
      configured: true,
      memberId: parsed.data.BITRIX24_PORTAL_MEMBER_ID,
      portalOrigin: canonicalPortalOriginFromConfiguredOrigin(parsed.data.BITRIX24_PORTAL_ORIGIN),
    };
  } catch {
    throw new PortalConfigurationError();
  }
}

export function getPortalConfiguration(): PortalConfiguration {
  return parsePortalConfiguration(process.env);
}

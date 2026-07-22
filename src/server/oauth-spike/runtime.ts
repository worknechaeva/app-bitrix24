import "server-only";

import type { Bitrix24IdentityClient } from "@/integrations/bitrix24/identity-client";
import { OAuthSpikeError } from "@/integrations/bitrix24/spike/errors";
import { FetchOAuthSpikeHttpTransport } from "@/integrations/bitrix24/spike/http-transport";
import { SpikeBitrix24IdentityClient } from "@/integrations/bitrix24/spike/spike-identity-client";
import {
  getOAuthSpikeInstallConfig,
  getOAuthSpikeUserConfig,
  type OAuthSpikeUserEnabledConfig,
} from "@/lib/env/oauth-spike";
import { EphemeralOAuthStateStore } from "./ephemeral-state-store";

export type OAuthSpikeLogger = {
  info(event: string, details: Record<string, boolean | string>): void;
};

type OAuthSpikeUnavailableRuntime = { status: "disabled" } | { status: "invalid" };

export type OAuthSpikeUserRuntime =
  | OAuthSpikeUnavailableRuntime
  | {
      status: "enabled";
      config: OAuthSpikeUserEnabledConfig;
      identityClient: Bitrix24IdentityClient;
      stateStore: EphemeralOAuthStateStore;
      logger: OAuthSpikeLogger;
    };

export type OAuthSpikeInstallRuntime =
  | OAuthSpikeUnavailableRuntime
  | {
      status: "enabled";
      logger: OAuthSpikeLogger;
    };

const stateStore = new EphemeralOAuthStateStore();
const transport = new FetchOAuthSpikeHttpTransport();
const logger: OAuthSpikeLogger = {
  info(event, details) {
    console.info(event, details);
  },
};

export function getOAuthSpikeUserRuntime(): OAuthSpikeUserRuntime {
  try {
    const config = getOAuthSpikeUserConfig();
    if (!config.enabled) return { status: "disabled" };

    return {
      status: "enabled",
      config,
      identityClient: new SpikeBitrix24IdentityClient(
        {
          portalOrigin: config.portalOrigin,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          redirectUri: config.redirectUri,
          tokenEndpoint: config.tokenEndpoint,
        },
        transport,
      ),
      stateStore,
      logger,
    };
  } catch (error) {
    if (error instanceof OAuthSpikeError) return { status: "invalid" };
    return { status: "invalid" };
  }
}

export function getOAuthSpikeInstallRuntime(): OAuthSpikeInstallRuntime {
  try {
    const config = getOAuthSpikeInstallConfig();
    if (!config.enabled) return { status: "disabled" };
    return { status: "enabled", logger };
  } catch {
    return { status: "invalid" };
  }
}

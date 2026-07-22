import "server-only";

import type { Bitrix24OAuthResult } from "../identity-client";
import {
  canonicalPortalOriginFromClientEndpoint,
  canonicalPortalOriginFromConfiguredOrigin,
} from "../portal-origin";
import { OAuthSpikeError } from "./errors";

export type VerifiedOAuthSpikePortalIdentity = {
  memberIdMatches: true;
  canonicalPortalOrigin: string;
};

export function verifyOAuthSpikePortalIdentity(
  result: Pick<Bitrix24OAuthResult, "memberId" | "clientEndpoint">,
  expectedMemberId: string,
  configuredPortalOrigin: string,
): VerifiedOAuthSpikePortalIdentity {
  if (result.memberId !== expectedMemberId) {
    throw new OAuthSpikeError("portal_mismatch");
  }

  const canonicalPortalOrigin = canonicalPortalOriginFromClientEndpoint(result.clientEndpoint);
  const canonicalConfiguredOrigin = canonicalPortalOriginFromConfiguredOrigin(configuredPortalOrigin);
  if (canonicalPortalOrigin !== canonicalConfiguredOrigin) {
    throw new OAuthSpikeError("portal_origin_mismatch");
  }

  return {
    memberIdMatches: true,
    canonicalPortalOrigin,
  };
}

export type OAuthSpikeRefreshBaseline = {
  memberId: string;
  canonicalPortalOrigin: string;
  scope: string[];
};

function normalizedScopes(scopes: string[]): string[] {
  return [...new Set(scopes)].sort();
}

export function verifyOAuthSpikeRefreshResult(
  result: Bitrix24OAuthResult,
  baseline: OAuthSpikeRefreshBaseline,
): VerifiedOAuthSpikePortalIdentity {
  const identity = verifyOAuthSpikePortalIdentity(result, baseline.memberId, baseline.canonicalPortalOrigin);

  if (JSON.stringify(normalizedScopes(result.scope)) !== JSON.stringify(normalizedScopes(baseline.scope))) {
    throw new OAuthSpikeError("oauth_metadata_drift");
  }

  if (
    (result.expiresAt === undefined && result.expiresIn === undefined) ||
    (result.expiresAt !== undefined && (!Number.isFinite(result.expiresAt) || result.expiresAt <= 0)) ||
    (result.expiresIn !== undefined && (!Number.isFinite(result.expiresIn) || result.expiresIn <= 0))
  ) {
    throw new OAuthSpikeError("oauth_metadata_drift");
  }

  return identity;
}

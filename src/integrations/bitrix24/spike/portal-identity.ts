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
  userId?: string;
};

export function normalizeOAuthSpikeScopes(scopes: string[]): string[] {
  return [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))].sort();
}

function verifyOAuthSpikeTokenMetadata(result: Bitrix24OAuthResult): string[] {
  const scope = normalizeOAuthSpikeScopes(result.scope);
  if (
    scope.length === 0 ||
    scope.some((name) => !/^[a-z0-9_-]+$/i.test(name)) ||
    (result.expiresAt === undefined && result.expiresIn === undefined) ||
    (result.expiresAt !== undefined && (!Number.isFinite(result.expiresAt) || result.expiresAt <= 0)) ||
    (result.expiresIn !== undefined && (!Number.isFinite(result.expiresIn) || result.expiresIn <= 0))
  ) {
    throw new OAuthSpikeError("oauth_metadata_drift");
  }
  return scope;
}

export type VerifiedOAuthSpikeAuthorization = VerifiedOAuthSpikePortalIdentity & {
  scope: string[];
};

export function verifyOAuthSpikeAuthorizationResult(
  result: Bitrix24OAuthResult,
  expectedMemberId: string,
  configuredPortalOrigin: string,
): VerifiedOAuthSpikeAuthorization {
  return {
    ...verifyOAuthSpikePortalIdentity(result, expectedMemberId, configuredPortalOrigin),
    scope: verifyOAuthSpikeTokenMetadata(result),
  };
}

export function verifyOAuthSpikeRefreshResult(
  result: Bitrix24OAuthResult,
  baseline: OAuthSpikeRefreshBaseline,
): VerifiedOAuthSpikePortalIdentity {
  const identity = verifyOAuthSpikePortalIdentity(result, baseline.memberId, baseline.canonicalPortalOrigin);

  const refreshedScope = verifyOAuthSpikeTokenMetadata(result);
  if (JSON.stringify(refreshedScope) !== JSON.stringify(normalizeOAuthSpikeScopes(baseline.scope))) {
    throw new OAuthSpikeError("oauth_metadata_drift");
  }

  if (baseline.userId !== undefined && result.userId !== undefined && baseline.userId !== result.userId) {
    throw new OAuthSpikeError("provider_identity_mismatch");
  }

  return identity;
}

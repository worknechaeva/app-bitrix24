import "server-only";

import { OAuthSpikeError } from "./errors";
import { normalizeOAuthSpikeScopes } from "./portal-identity";

export const MAX_OAUTH_SPIKE_PERMISSION_COUNT = 32;
export const MAX_OAUTH_SPIKE_PERMISSION_NAME_LENGTH = 64;
export const SAFE_OAUTH_SPIKE_PERMISSION_NAME = /^[a-z0-9_-]+$/i;

export function normalizeOAuthSpikePermissions(permissions: string[]): string[] {
  return normalizeOAuthSpikeScopes(permissions);
}

export function validateOAuthSpikePermissions(permissions: string[]): string[] {
  const normalized = normalizeOAuthSpikePermissions(permissions);
  if (
    normalized.length === 0 ||
    normalized.length > MAX_OAUTH_SPIKE_PERMISSION_COUNT ||
    normalized.some(
      (permission) =>
        permission.length > MAX_OAUTH_SPIKE_PERMISSION_NAME_LENGTH ||
        !SAFE_OAUTH_SPIKE_PERMISSION_NAME.test(permission),
    )
  ) {
    throw new OAuthSpikeError("provider_unavailable");
  }
  return normalized;
}

export function verifyOAuthSpikePermissionHypothesis(
  permissions: string[],
  hypothesis: "user_brief" | "user",
): string[] {
  const normalized = validateOAuthSpikePermissions(permissions);
  if (!normalized.includes(hypothesis)) {
    throw new OAuthSpikeError("permission_hypothesis_mismatch");
  }
  return normalized;
}

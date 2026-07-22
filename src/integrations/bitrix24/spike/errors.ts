import "server-only";

export type OAuthSpikeReasonCode =
  | "spike_disabled"
  | "invalid_configuration"
  | "oauth_denied"
  | "missing_code_or_state"
  | "invalid_state"
  | "expired_state"
  | "reused_state"
  | "state_generation_failed"
  | "token_exchange_failed"
  | "portal_mismatch"
  | "portal_origin_mismatch"
  | "invalid_client_endpoint"
  | "provider_identity_mismatch"
  | "oauth_metadata_drift"
  | "inactive_user"
  | "external_user"
  | "unknown_user_type"
  | "provider_unavailable"
  | "invalid_install_payload";

export class OAuthSpikeError extends Error {
  constructor(public readonly reasonCode: OAuthSpikeReasonCode) {
    super(reasonCode);
    this.name = "OAuthSpikeError";
  }
}

export function getSafeOAuthSpikeReason(error: unknown): OAuthSpikeReasonCode {
  if (error instanceof OAuthSpikeError) return error.reasonCode;
  return "provider_unavailable";
}

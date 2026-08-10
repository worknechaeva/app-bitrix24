import "server-only";

export type Bitrix24AuthReasonCode =
  | "invalid_configuration"
  | "invalid_request"
  | "invalid_state"
  | "expired_state"
  | "reused_state"
  | "oauth_denied"
  | "token_exchange_failed"
  | "portal_mismatch"
  | "invalid_client_endpoint"
  | "missing_app_scope"
  | "missing_user_brief_permission"
  | "provider_identity_mismatch"
  | "inactive_user"
  | "external_user"
  | "unknown_user_type"
  | "profile_inactive"
  | "credentials_disabled"
  | "credential_version_conflict"
  | "provider_unavailable"
  | "storage_failure"
  | "crypto_failure"
  | "session_failure"
  | "invalid_install_payload"
  | "internal_error";

export class Bitrix24AuthError extends Error {
  constructor(public readonly reasonCode: Bitrix24AuthReasonCode) {
    super(reasonCode);
    this.name = "Bitrix24AuthError";
  }
}

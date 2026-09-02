import "server-only";

export type Bitrix24DirectoryErrorCode =
  | "credentials_unavailable"
  | "unauthorized"
  | "permission_denied"
  | "provider_unavailable"
  | "malformed_provider_response"
  | "unsupported_provider_contract";

export class Bitrix24DirectoryError extends Error {
  constructor(public readonly code: Bitrix24DirectoryErrorCode) {
    super("Bitrix24 directory is unavailable");
    this.name = "Bitrix24DirectoryError";
  }
}

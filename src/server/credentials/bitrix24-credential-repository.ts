import "server-only";

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export const BITRIX24_CREDENTIAL_ENCRYPTION_VERSION = 1 as const;

export type EncryptedTokenEnvelope = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

export type EncryptedBitrix24Credential = {
  id: string;
  portalInstallationId: number;
  profileId: string;
  encryptedAccessToken: EncryptedTokenEnvelope;
  encryptedRefreshToken: EncryptedTokenEnvelope;
  encryptionVersion: typeof BITRIX24_CREDENTIAL_ENCRYPTION_VERSION;
  tokenVersion: number;
  clientEndpoint: string;
  accessTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Bitrix24CredentialCreation =
  | { outcome: "created"; credential: EncryptedBitrix24Credential }
  | { outcome: "profile_unknown" | "profile_inactive" | "already_exists" };

export type Bitrix24CredentialResolution =
  | { outcome: "active"; credential: EncryptedBitrix24Credential }
  | { outcome: "unknown" | "profile_inactive" | "reauth_required" | "disabled" };

export type Bitrix24CredentialRotation =
  | { outcome: "rotated"; tokenVersion: number }
  | {
      outcome: "unknown" | "profile_inactive" | "reauth_required" | "disabled" | "version_conflict";
    };

export type Bitrix24CredentialReauthTransition = {
  outcome:
    "marked" | "already_reauth_required" | "unknown" | "profile_inactive" | "disabled" | "version_conflict";
};

export type EncryptedCredentialWrite = {
  portalInstallationId: number;
  profileId: string;
  encryptedAccessToken: EncryptedTokenEnvelope;
  encryptedRefreshToken: EncryptedTokenEnvelope;
  encryptionVersion: typeof BITRIX24_CREDENTIAL_ENCRYPTION_VERSION;
  clientEndpoint: string;
  accessTokenExpiresAt: string | null;
};

export class Bitrix24CredentialInputError extends Error {
  readonly code = "invalid_bitrix24_credential_input";

  constructor() {
    super("Invalid Bitrix24 credential input");
    this.name = "Bitrix24CredentialInputError";
  }
}

export function isCanonicalBase64Url(value: string): boolean {
  if (!BASE64URL_PATTERN.test(value) || value.includes("=")) return false;
  try {
    return Buffer.from(value, "base64url").toString("base64url") === value;
  } catch {
    return false;
  }
}

export interface Bitrix24CredentialRepository {
  /** Plaintext tokens and the encryption key must never cross this boundary. */
  createInitial(input: EncryptedCredentialWrite): Promise<Bitrix24CredentialCreation>;

  resolve(input: { portalInstallationId: number; profileId: string }): Promise<Bitrix24CredentialResolution>;

  /** Replaces both encrypted tokens atomically using optimistic token-version locking. */
  rotate(
    input: EncryptedCredentialWrite & { expectedTokenVersion: number },
  ): Promise<Bitrix24CredentialRotation>;

  markReauthRequired(input: {
    portalInstallationId: number;
    profileId: string;
    expectedTokenVersion: number;
  }): Promise<Bitrix24CredentialReauthTransition>;
}

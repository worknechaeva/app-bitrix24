import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EncryptedTokenEnvelope } from "./bitrix24-credential-repository";
import { isCanonicalBase64Url } from "./bitrix24-credential-repository";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const AAD_MARKER = "task-launcher:bitrix24-credentials:v1";

export type CredentialTokenKind = "access" | "refresh";

export type CredentialEncryptionContext = {
  portalInstallationId: number;
  profileId: string;
  tokenKind: CredentialTokenKind;
  tokenVersion: number;
};

export class Bitrix24CredentialCryptoError extends Error {
  readonly code = "bitrix24_credential_crypto_failure";

  constructor() {
    super("Bitrix24 credential cryptography failure");
    this.name = "Bitrix24CredentialCryptoError";
  }
}

function validateContext(context: CredentialEncryptionContext): void {
  if (
    context.portalInstallationId !== 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(context.profileId) ||
    !Number.isSafeInteger(context.tokenVersion) ||
    context.tokenVersion < 1 ||
    (context.tokenKind !== "access" && context.tokenKind !== "refresh")
  ) {
    throw new Bitrix24CredentialCryptoError();
  }
}

export function buildBitrix24CredentialAad(context: CredentialEncryptionContext): Buffer {
  validateContext(context);
  return Buffer.from(
    JSON.stringify([
      AAD_MARKER,
      context.portalInstallationId,
      context.profileId.toLowerCase(),
      context.tokenKind,
      context.tokenVersion,
    ]),
    "utf8",
  );
}

function decodeEnvelope(envelope: EncryptedTokenEnvelope) {
  if (
    !isCanonicalBase64Url(envelope.ciphertext) ||
    !isCanonicalBase64Url(envelope.iv) ||
    !isCanonicalBase64Url(envelope.authTag)
  ) {
    throw new Bitrix24CredentialCryptoError();
  }

  const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
  const iv = Buffer.from(envelope.iv, "base64url");
  const authTag = Buffer.from(envelope.authTag, "base64url");
  if (ciphertext.length === 0 || iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Bitrix24CredentialCryptoError();
  }
  return { ciphertext, iv, authTag };
}

export class Bitrix24CredentialCrypto {
  private readonly key: Buffer;

  constructor(
    encryptionKey: Uint8Array,
    private readonly createRandomBytes: (size: number) => Buffer = randomBytes,
  ) {
    if (encryptionKey.byteLength !== KEY_BYTES) throw new Bitrix24CredentialCryptoError();
    this.key = Buffer.from(encryptionKey);
  }

  encryptTokenPair(input: {
    accessToken: string;
    refreshToken: string;
    portalInstallationId: number;
    profileId: string;
    tokenVersion: number;
  }): { encryptedAccessToken: EncryptedTokenEnvelope; encryptedRefreshToken: EncryptedTokenEnvelope } {
    const accessIv = this.randomIv();
    let refreshIv = this.randomIv();
    let attempts = 0;
    while (refreshIv.equals(accessIv) && attempts < 4) {
      refreshIv = this.randomIv();
      attempts += 1;
    }
    if (refreshIv.equals(accessIv)) throw new Bitrix24CredentialCryptoError();

    return {
      encryptedAccessToken: this.encryptWithIv(input.accessToken, accessIv, {
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
        tokenKind: "access",
        tokenVersion: input.tokenVersion,
      }),
      encryptedRefreshToken: this.encryptWithIv(input.refreshToken, refreshIv, {
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
        tokenKind: "refresh",
        tokenVersion: input.tokenVersion,
      }),
    };
  }

  decryptToken(envelope: EncryptedTokenEnvelope, context: CredentialEncryptionContext): string {
    try {
      const { ciphertext, iv, authTag } = decodeEnvelope(envelope);
      const decipher = createDecipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_BYTES });
      decipher.setAAD(buildBitrix24CredentialAad(context));
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      if (plaintext.length === 0) throw new Bitrix24CredentialCryptoError();
      return plaintext;
    } catch {
      throw new Bitrix24CredentialCryptoError();
    }
  }

  private randomIv(): Buffer {
    const iv = this.createRandomBytes(IV_BYTES);
    if (!Buffer.isBuffer(iv) || iv.length !== IV_BYTES) throw new Bitrix24CredentialCryptoError();
    return iv;
  }

  private encryptWithIv(
    plaintext: string,
    iv: Buffer,
    context: CredentialEncryptionContext,
  ): EncryptedTokenEnvelope {
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      throw new Bitrix24CredentialCryptoError();
    }

    try {
      const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: AUTH_TAG_BYTES });
      cipher.setAAD(buildBitrix24CredentialAad(context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return {
        ciphertext: ciphertext.toString("base64url"),
        iv: iv.toString("base64url"),
        authTag: cipher.getAuthTag().toString("base64url"),
      };
    } catch {
      throw new Bitrix24CredentialCryptoError();
    }
  }
}

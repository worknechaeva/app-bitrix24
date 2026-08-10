import { describe, expect, it } from "vitest";
import {
  Bitrix24CredentialCrypto,
  Bitrix24CredentialCryptoError,
  buildBitrix24CredentialAad,
  type CredentialEncryptionContext,
} from "@/server/credentials/bitrix24-credential-crypto";

const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const otherProfileId = "118f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const key = Buffer.alloc(32, 0x41);
const context: CredentialEncryptionContext = {
  portalInstallationId: 1,
  profileId,
  tokenKind: "access",
  tokenVersion: 1,
};

function mutate(value: string): string {
  return `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
}

describe("Bitrix24 credential cryptography", () => {
  it("uses canonical AAD bound to marker, portal, profile, kind, and token version", () => {
    expect(buildBitrix24CredentialAad(context).toString("utf8")).toBe(
      '["task-launcher:bitrix24-credentials:v1",1,"018f47a7-7c60-7a31-8f6a-27f4bb596f5a","access",1]',
    );
    expect(buildBitrix24CredentialAad({ ...context, profileId: profileId.toUpperCase() })).toEqual(
      buildBitrix24CredentialAad(context),
    );
  });

  it("round trips an access/refresh pair with separate 12-byte random IVs and 16-byte tags", () => {
    const randomValues = [Buffer.alloc(12, 1), Buffer.alloc(12, 2)];
    const crypto = new Bitrix24CredentialCrypto(key, () => randomValues.shift()!);
    const pair = crypto.encryptTokenPair({
      accessToken: "synthetic-access",
      refreshToken: "synthetic-refresh",
      portalInstallationId: 1,
      profileId,
      tokenVersion: 1,
    });

    expect(pair.encryptedAccessToken.iv).not.toBe(pair.encryptedRefreshToken.iv);
    expect(Buffer.from(pair.encryptedAccessToken.iv, "base64url")).toHaveLength(12);
    expect(Buffer.from(pair.encryptedRefreshToken.iv, "base64url")).toHaveLength(12);
    expect(Buffer.from(pair.encryptedAccessToken.authTag, "base64url")).toHaveLength(16);
    expect(Buffer.from(pair.encryptedRefreshToken.authTag, "base64url")).toHaveLength(16);
    expect(pair.encryptedAccessToken.iv).not.toContain("=");
    expect(pair.encryptedAccessToken.authTag).not.toContain("=");
    expect(crypto.decryptToken(pair.encryptedAccessToken, { ...context, tokenKind: "access" })).toBe(
      "synthetic-access",
    );
    expect(crypto.decryptToken(pair.encryptedRefreshToken, { ...context, tokenKind: "refresh" })).toBe(
      "synthetic-refresh",
    );
  });

  it("uses different ciphertext for the same plaintext with different random IVs", () => {
    const crypto = new Bitrix24CredentialCrypto(key);
    const first = crypto.encryptTokenPair({
      accessToken: "same-token",
      refreshToken: "refresh-one",
      portalInstallationId: 1,
      profileId,
      tokenVersion: 1,
    });
    const second = crypto.encryptTokenPair({
      accessToken: "same-token",
      refreshToken: "refresh-two",
      portalInstallationId: 1,
      profileId,
      tokenVersion: 1,
    });

    expect(first.encryptedAccessToken.iv).not.toBe(second.encryptedAccessToken.iv);
    expect(first.encryptedAccessToken.ciphertext).not.toBe(second.encryptedAccessToken.ciphertext);
  });

  it.each([
    {
      label: "ciphertext",
      change: (envelope: ReturnType<typeof encryptedAccess>) => ({
        ...envelope,
        ciphertext: mutate(envelope.ciphertext),
      }),
    },
    {
      label: "auth tag",
      change: (envelope: ReturnType<typeof encryptedAccess>) => ({
        ...envelope,
        authTag: mutate(envelope.authTag),
      }),
    },
  ])("fails closed for modified $label", ({ change }) => {
    const crypto = new Bitrix24CredentialCrypto(key);
    const envelope = encryptedAccess(crypto);
    expect(() => crypto.decryptToken(change(envelope), context)).toThrow(Bitrix24CredentialCryptoError);
  });

  it.each([
    ["wrong profile", new Bitrix24CredentialCrypto(key), { ...context, profileId: otherProfileId }],
    ["wrong token kind", new Bitrix24CredentialCrypto(key), { ...context, tokenKind: "refresh" as const }],
    ["wrong token version", new Bitrix24CredentialCrypto(key), { ...context, tokenVersion: 2 }],
    ["wrong key", new Bitrix24CredentialCrypto(Buffer.alloc(32, 0x42)), context],
  ])("fails closed for %s authenticated context", (_label, decryptor, wrongContext) => {
    const envelope = encryptedAccess(new Bitrix24CredentialCrypto(key));
    expect(() => decryptor.decryptToken(envelope, wrongContext)).toThrow(Bitrix24CredentialCryptoError);
  });

  it("fails closed for the wrong portal in AAD", () => {
    const crypto = new Bitrix24CredentialCrypto(key);
    const envelope = encryptedAccess(crypto);
    expect(() => crypto.decryptToken(envelope, { ...context, portalInstallationId: 2 })).toThrow(
      Bitrix24CredentialCryptoError,
    );
  });

  it.each([Buffer.alloc(0), Buffer.alloc(16), Buffer.alloc(31), Buffer.alloc(33)])(
    "rejects a key that is not exactly 32 bytes",
    (invalidKey) => {
      expect(() => new Bitrix24CredentialCrypto(invalidKey)).toThrow(Bitrix24CredentialCryptoError);
    },
  );

  it("never includes plaintext, ciphertext, or key material in crypto errors", () => {
    const token = "synthetic-secret-token";
    const crypto = new Bitrix24CredentialCrypto(key);
    const pair = crypto.encryptTokenPair({
      accessToken: token,
      refreshToken: "synthetic-refresh",
      portalInstallationId: 1,
      profileId,
      tokenVersion: 1,
    });

    let thrown: unknown;
    try {
      crypto.decryptToken(
        { ...pair.encryptedAccessToken, authTag: mutate(pair.encryptedAccessToken.authTag) },
        context,
      );
    } catch (error) {
      thrown = error;
    }
    expect(String(thrown)).not.toContain(token);
    expect(String(thrown)).not.toContain(pair.encryptedAccessToken.ciphertext);
    expect(String(thrown)).not.toContain(key.toString("base64"));
  });
});

function encryptedAccess(crypto: Bitrix24CredentialCrypto) {
  return crypto.encryptTokenPair({
    accessToken: "synthetic-access",
    refreshToken: "synthetic-refresh",
    portalInstallationId: 1,
    profileId,
    tokenVersion: 1,
  }).encryptedAccessToken;
}

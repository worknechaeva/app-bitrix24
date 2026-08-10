import { describe, expect, it, vi } from "vitest";
import type {
  Bitrix24CredentialRepository,
  EncryptedBitrix24Credential,
} from "@/server/credentials/bitrix24-credential-repository";
import { Bitrix24CredentialCrypto } from "@/server/credentials/bitrix24-credential-crypto";
import {
  Bitrix24CredentialService,
  Bitrix24CredentialServiceError,
} from "@/server/credentials/bitrix24-credential-service";

const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const credentialId = "118f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const key = Buffer.alloc(32, 0x62);
const endpoint = "https://portal.example/rest/";

function repositoryStub(): Bitrix24CredentialRepository {
  return {
    createInitial: vi.fn(async () => ({ outcome: "profile_unknown" }) as const),
    resolve: vi.fn(async () => ({ outcome: "unknown" }) as const),
    rotate: vi.fn(async () => ({ outcome: "version_conflict" }) as const),
    markReauthRequired: vi.fn(async () => ({ outcome: "unknown" }) as const),
  };
}

function encryptedCredential(tokenVersion = 1): EncryptedBitrix24Credential {
  const crypto = new Bitrix24CredentialCrypto(key);
  const pair = crypto.encryptTokenPair({
    accessToken: "resolved-access-token",
    refreshToken: "resolved-refresh-token",
    portalInstallationId: 1,
    profileId,
    tokenVersion,
  });
  return {
    id: credentialId,
    portalInstallationId: 1,
    profileId,
    ...pair,
    encryptionVersion: 1,
    tokenVersion,
    clientEndpoint: endpoint,
    accessTokenExpiresAt: null,
    createdAt: "2026-08-10T12:00:00.000Z",
    updatedAt: "2026-08-10T12:00:00.000Z",
  };
}

describe("Bitrix24 credential service boundary", () => {
  it("passes only encrypted envelopes and metadata to initial persistence", async () => {
    const repository = repositoryStub();
    vi.mocked(repository.createInitial).mockResolvedValueOnce({ outcome: "profile_unknown" });
    const service = new Bitrix24CredentialService(repository, new Bitrix24CredentialCrypto(key));
    const accessToken = "plaintext-access-create";
    const refreshToken = "plaintext-refresh-create";

    await service.createInitial({
      portalInstallationId: 1,
      profileId,
      accessToken,
      refreshToken,
      clientEndpoint: endpoint,
    });

    const persisted = vi.mocked(repository.createInitial).mock.calls[0]?.[0];
    expect(persisted).toMatchObject({
      portalInstallationId: 1,
      profileId,
      encryptionVersion: 1,
      clientEndpoint: endpoint,
      accessTokenExpiresAt: null,
    });
    expect(persisted).not.toHaveProperty("accessToken");
    expect(persisted).not.toHaveProperty("refreshToken");
    expect(persisted).not.toHaveProperty("encryptionKey");
    expect(JSON.stringify(persisted)).not.toContain(accessToken);
    expect(JSON.stringify(persisted)).not.toContain(refreshToken);
    expect(JSON.stringify(persisted)).not.toContain(key.toString("base64"));
  });

  it("decrypts an active repository result only in the server service", async () => {
    const repository = repositoryStub();
    vi.mocked(repository.resolve).mockResolvedValueOnce({
      outcome: "active",
      credential: encryptedCredential(),
    });
    const service = new Bitrix24CredentialService(repository, new Bitrix24CredentialCrypto(key));

    await expect(service.resolve({ portalInstallationId: 1, profileId })).resolves.toEqual({
      outcome: "active",
      accessToken: "resolved-access-token",
      refreshToken: "resolved-refresh-token",
      clientEndpoint: endpoint,
      accessTokenExpiresAt: null,
      tokenVersion: 1,
    });
  });

  it.each(["reauth_required", "disabled", "profile_inactive"] as const)(
    "does not decrypt the %s outcome",
    async (outcome) => {
      const repository = repositoryStub();
      vi.mocked(repository.resolve).mockResolvedValueOnce({ outcome });
      const crypto = new Bitrix24CredentialCrypto(key);
      const decrypt = vi.spyOn(crypto, "decryptToken");
      const service = new Bitrix24CredentialService(repository, crypto);

      await expect(service.resolve({ portalInstallationId: 1, profileId })).resolves.toEqual({ outcome });
      expect(decrypt).not.toHaveBeenCalled();
    },
  );

  it("encrypts a rotated pair with the next AAD version and preserves version conflict", async () => {
    const repository = repositoryStub();
    vi.mocked(repository.rotate).mockResolvedValueOnce({ outcome: "version_conflict" });
    const crypto = new Bitrix24CredentialCrypto(key);
    const service = new Bitrix24CredentialService(repository, crypto);

    await expect(
      service.rotate({
        portalInstallationId: 1,
        profileId,
        expectedTokenVersion: 4,
        accessToken: "plaintext-access-rotate",
        refreshToken: "plaintext-refresh-rotate",
        clientEndpoint: endpoint,
      }),
    ).resolves.toEqual({ outcome: "version_conflict" });

    const persisted = vi.mocked(repository.rotate).mock.calls[0]?.[0];
    expect(persisted).not.toHaveProperty("accessToken");
    expect(persisted).not.toHaveProperty("refreshToken");
    expect(persisted).not.toHaveProperty("encryptionKey");
    expect(
      crypto.decryptToken(persisted!.encryptedAccessToken, {
        portalInstallationId: 1,
        profileId,
        tokenKind: "access",
        tokenVersion: 5,
      }),
    ).toBe("plaintext-access-rotate");
    expect(
      crypto.decryptToken(persisted!.encryptedRefreshToken, {
        portalInstallationId: 1,
        profileId,
        tokenKind: "refresh",
        tokenVersion: 5,
      }),
    ).toBe("plaintext-refresh-rotate");
  });

  it.each([
    () => Promise.reject(new Error("plaintext-access-must-not-escape")),
    async () =>
      ({
        outcome: "active",
        credential: {
          ...encryptedCredential(),
          encryptedAccessToken: { ciphertext: "bad", iv: "bad", authTag: "bad" },
        },
      }) as const,
  ])("normalizes repository and malformed payload failures", async (resolve) => {
    const repository = repositoryStub();
    vi.mocked(repository.resolve).mockImplementationOnce(resolve);
    const service = new Bitrix24CredentialService(repository, new Bitrix24CredentialCrypto(key));

    let thrown: unknown;
    try {
      await service.resolve({ portalInstallationId: 1, profileId });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Bitrix24CredentialServiceError);
    expect(String(thrown)).not.toContain("plaintext-access");
    expect(String(thrown)).not.toContain("bad");
  });
});

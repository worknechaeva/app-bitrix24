import "server-only";

import { canonicalBitrix24ClientEndpoint } from "@/integrations/bitrix24/portal-origin";
import { getBitrix24CredentialsEncryptionKey } from "@/lib/env/bitrix24-credentials";
import type {
  Bitrix24CredentialCreation,
  Bitrix24CredentialReauthTransition,
  Bitrix24CredentialRepository,
  Bitrix24CredentialRotation,
  Bitrix24VerifiedOAuthReplacement,
} from "./bitrix24-credential-repository";
import { BITRIX24_CREDENTIAL_ENCRYPTION_VERSION } from "./bitrix24-credential-repository";
import { Bitrix24CredentialCrypto } from "./bitrix24-credential-crypto";

export class Bitrix24CredentialServiceError extends Error {
  readonly code = "bitrix24_credential_service_failure";

  constructor() {
    super("Bitrix24 credential service failure");
    this.name = "Bitrix24CredentialServiceError";
  }
}

export type ActiveBitrix24Credentials = {
  outcome: "active";
  accessToken: string;
  refreshToken: string;
  clientEndpoint: string;
  accessTokenExpiresAt: string | null;
  tokenVersion: number;
};

export type Bitrix24CredentialServiceResolution =
  ActiveBitrix24Credentials | { outcome: "unknown" | "profile_inactive" | "reauth_required" | "disabled" };

export class Bitrix24CredentialService {
  constructor(
    private readonly repository: Bitrix24CredentialRepository,
    private readonly crypto: Bitrix24CredentialCrypto,
  ) {}

  async createInitial(input: {
    portalInstallationId: number;
    profileId: string;
    accessToken: string;
    refreshToken: string;
    clientEndpoint: string;
    accessTokenExpiresAt?: string | null;
  }): Promise<Bitrix24CredentialCreation> {
    try {
      const encrypted = this.crypto.encryptTokenPair({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
        tokenVersion: 1,
      });
      return await this.repository.createInitial({
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
        ...encrypted,
        encryptionVersion: BITRIX24_CREDENTIAL_ENCRYPTION_VERSION,
        clientEndpoint: canonicalBitrix24ClientEndpoint(input.clientEndpoint),
        accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
      });
    } catch {
      throw new Bitrix24CredentialServiceError();
    }
  }

  async resolve(input: {
    portalInstallationId: number;
    profileId: string;
  }): Promise<Bitrix24CredentialServiceResolution> {
    try {
      const result = await this.repository.resolve(input);
      if (result.outcome !== "active") return result;

      const { credential } = result;
      return {
        outcome: "active",
        accessToken: this.crypto.decryptToken(credential.encryptedAccessToken, {
          portalInstallationId: credential.portalInstallationId,
          profileId: credential.profileId,
          tokenKind: "access",
          tokenVersion: credential.tokenVersion,
        }),
        refreshToken: this.crypto.decryptToken(credential.encryptedRefreshToken, {
          portalInstallationId: credential.portalInstallationId,
          profileId: credential.profileId,
          tokenKind: "refresh",
          tokenVersion: credential.tokenVersion,
        }),
        clientEndpoint: credential.clientEndpoint,
        accessTokenExpiresAt: credential.accessTokenExpiresAt,
        tokenVersion: credential.tokenVersion,
      };
    } catch {
      throw new Bitrix24CredentialServiceError();
    }
  }

  async rotate(input: {
    portalInstallationId: number;
    profileId: string;
    expectedTokenVersion: number;
    accessToken: string;
    refreshToken: string;
    clientEndpoint: string;
    accessTokenExpiresAt?: string | null;
  }): Promise<Bitrix24CredentialRotation> {
    try {
      const encrypted = this.crypto.encryptTokenPair({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
        tokenVersion: input.expectedTokenVersion + 1,
      });
      return await this.repository.rotate({
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
        expectedTokenVersion: input.expectedTokenVersion,
        ...encrypted,
        encryptionVersion: BITRIX24_CREDENTIAL_ENCRYPTION_VERSION,
        clientEndpoint: canonicalBitrix24ClientEndpoint(input.clientEndpoint),
        accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
      });
    } catch {
      throw new Bitrix24CredentialServiceError();
    }
  }

  async markReauthRequired(input: {
    portalInstallationId: number;
    profileId: string;
    expectedTokenVersion: number;
  }): Promise<Bitrix24CredentialReauthTransition> {
    try {
      return await this.repository.markReauthRequired(input);
    } catch {
      throw new Bitrix24CredentialServiceError();
    }
  }

  async replaceAfterVerifiedOAuth(input: {
    portalInstallationId: number;
    profileId: string;
    accessToken: string;
    refreshToken: string;
    clientEndpoint: string;
    accessTokenExpiresAt?: string | null;
  }): Promise<Bitrix24VerifiedOAuthReplacement> {
    try {
      const context = await this.repository.inspectForVerifiedOAuth({
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
      });
      if (context.outcome !== "missing" && context.outcome !== "replaceable") return context;

      const nextTokenVersion = context.nextTokenVersion;
      const encrypted = this.crypto.encryptTokenPair({
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
        tokenVersion: nextTokenVersion,
      });
      return await this.repository.replaceAfterVerifiedOAuth({
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
        expectedCurrentTokenVersion: context.outcome === "missing" ? null : context.currentTokenVersion,
        newTokenVersion: nextTokenVersion,
        ...encrypted,
        encryptionVersion: BITRIX24_CREDENTIAL_ENCRYPTION_VERSION,
        clientEndpoint: canonicalBitrix24ClientEndpoint(input.clientEndpoint),
        accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
      });
    } catch {
      throw new Bitrix24CredentialServiceError();
    }
  }
}

export function createBitrix24CredentialService(
  repository: Bitrix24CredentialRepository,
): Bitrix24CredentialService {
  return new Bitrix24CredentialService(
    repository,
    new Bitrix24CredentialCrypto(getBitrix24CredentialsEncryptionKey()),
  );
}

import "server-only";

import { Bitrix24DirectoryError } from "@/integrations/bitrix24/directory-errors";
import type {
  Bitrix24DirectoryCredentialProvider,
  Bitrix24DirectoryCredentials,
} from "@/integrations/bitrix24/live-directory-client";
import type { Bitrix24CredentialService } from "./bitrix24-credential-service";

export class StoredBitrix24DirectoryCredentialProvider implements Bitrix24DirectoryCredentialProvider {
  constructor(
    private readonly service: Bitrix24CredentialService,
    private readonly actor: { portalInstallationId: number; profileId: string },
    private readonly now: () => number = Date.now,
  ) {}

  async resolve(): Promise<Bitrix24DirectoryCredentials> {
    try {
      const resolved = await this.service.resolve(this.actor);
      if (resolved.outcome !== "active") {
        throw new Bitrix24DirectoryError("credentials_unavailable");
      }
      if (
        resolved.accessTokenExpiresAt !== null &&
        new Date(resolved.accessTokenExpiresAt).getTime() <= this.now()
      ) {
        throw new Bitrix24DirectoryError("unauthorized");
      }
      return { accessToken: resolved.accessToken, clientEndpoint: resolved.clientEndpoint };
    } catch (error) {
      if (error instanceof Bitrix24DirectoryError) throw error;
      throw new Bitrix24DirectoryError("credentials_unavailable");
    }
  }
}

import "server-only";

import { FetchBitrix24HttpTransport } from "@/integrations/bitrix24/http-transport";
import { LiveBitrix24DirectoryClient } from "@/integrations/bitrix24/live-directory-client";
import { createBitrix24CredentialService } from "@/server/credentials/bitrix24-credential-service";
import { StoredBitrix24DirectoryCredentialProvider } from "@/server/credentials/bitrix24-directory-credential-provider";
import { createSupabaseBitrix24CredentialRepository } from "@/server/credentials/supabase-bitrix24-credential-repository";

export function createProductionBitrix24DirectoryClient(actor: {
  portalInstallationId: number;
  profileId: string;
}): LiveBitrix24DirectoryClient {
  const credentials = new StoredBitrix24DirectoryCredentialProvider(
    createBitrix24CredentialService(createSupabaseBitrix24CredentialRepository()),
    actor,
  );
  return new LiveBitrix24DirectoryClient(credentials, new FetchBitrix24HttpTransport());
}

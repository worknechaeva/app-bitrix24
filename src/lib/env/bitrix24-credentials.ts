import "server-only";

type CredentialsEnvironment = Record<string, string | undefined>;

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4}){10}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$/;
const ENCRYPTION_KEY_BYTES = 32;

export class Bitrix24CredentialsConfigurationError extends Error {
  readonly code = "invalid_bitrix24_credentials_configuration";

  constructor() {
    super("Invalid Bitrix24 credentials configuration");
    this.name = "Bitrix24CredentialsConfigurationError";
  }
}

export function parseBitrix24CredentialsEncryptionKey(environment: CredentialsEnvironment): Buffer {
  const encoded = environment.BITRIX24_CREDENTIALS_ENCRYPTION_KEY;

  if (!encoded || !BASE64_PATTERN.test(encoded)) {
    throw new Bitrix24CredentialsConfigurationError();
  }

  const key = Buffer.from(encoded, "base64");
  if (key.length !== ENCRYPTION_KEY_BYTES || key.toString("base64") !== encoded) {
    throw new Bitrix24CredentialsConfigurationError();
  }

  return key;
}

export function getBitrix24CredentialsEncryptionKey(): Buffer {
  return parseBitrix24CredentialsEncryptionKey(process.env);
}

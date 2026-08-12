import "server-only";

type BootstrapAdminEnvironment = Record<string, string | undefined>;

const BITRIX_USER_ID_PATTERN = /^[1-9][0-9]{0,63}$/;

export class BootstrapAdminConfigurationError extends Error {
  readonly code = "invalid_bootstrap_admin_configuration";

  constructor() {
    super("Invalid bootstrap administrator configuration");
    this.name = "BootstrapAdminConfigurationError";
  }
}

export function parseBootstrapAdminBitrixUserId(environment: BootstrapAdminEnvironment): string | null {
  const value = environment.BOOTSTRAP_ADMIN_BITRIX_USER_ID;
  if (value === undefined || value === "") return null;
  if (!BITRIX_USER_ID_PATTERN.test(value)) throw new BootstrapAdminConfigurationError();
  return value;
}

export function getBootstrapAdminBitrixUserId(): string | null {
  return parseBootstrapAdminBitrixUserId(process.env);
}

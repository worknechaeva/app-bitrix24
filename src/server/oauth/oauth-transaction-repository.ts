import "server-only";

const STATE_HASH_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const ENCODED_UNSAFE_CHARACTER_PATTERN = /%(?:0[0-9a-f]|1[0-9a-f]|25|7f|2f|5c)/i;
const RETURN_PATH_SENTINEL_ORIGIN = "https://task-launcher.invalid";

export type OAuthTransaction = {
  id: string;
  returnPath: string;
  createdAt: string;
  expiresAt: string;
};

export type OAuthTransactionConsumption =
  { outcome: "consumed"; returnPath: string } | { outcome: "unknown" | "expired" | "already_consumed" };

export class OAuthTransactionInputError extends Error {
  readonly code = "invalid_oauth_transaction_input";

  constructor() {
    super("Invalid OAuth transaction input");
    this.name = "OAuthTransactionInputError";
  }
}

export function validateOAuthStateHash(stateHash: string): string {
  if (!STATE_HASH_PATTERN.test(stateHash)) throw new OAuthTransactionInputError();
  return stateHash;
}

export function canonicalizeOAuthReturnPath(returnPath: string): string {
  if (
    !returnPath.startsWith("/") ||
    returnPath.startsWith("//") ||
    returnPath.includes("\\") ||
    CONTROL_CHARACTER_PATTERN.test(returnPath) ||
    ENCODED_UNSAFE_CHARACTER_PATTERN.test(returnPath) ||
    returnPath.length > 2048
  ) {
    throw new OAuthTransactionInputError();
  }

  let parsed: URL;
  try {
    parsed = new URL(returnPath, RETURN_PATH_SENTINEL_ORIGIN);
  } catch {
    throw new OAuthTransactionInputError();
  }

  if (parsed.origin !== RETURN_PATH_SENTINEL_ORIGIN) throw new OAuthTransactionInputError();

  const canonicalPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (!canonicalPath.startsWith("/") || canonicalPath.startsWith("//")) {
    throw new OAuthTransactionInputError();
  }
  return canonicalPath;
}

export interface OAuthTransactionRepository {
  /** Stores only a full SHA-256 hash. The raw OAuth state is not accepted. */
  create(input: { stateHash: string; returnPath: string }): Promise<OAuthTransaction>;

  /** Atomically consumes a transaction by its full SHA-256 hash. */
  consume(stateHash: string): Promise<OAuthTransactionConsumption>;
}

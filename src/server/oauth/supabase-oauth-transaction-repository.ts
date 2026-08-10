import "server-only";

import { z } from "zod";
import {
  consumeOAuthTransactionRpc,
  createOAuthTransactionRow,
  type OAuthTransactionConsumeTransport,
  type OAuthTransactionCreateTransport,
} from "@/server/database/supabase-privileged-gateway";
import {
  canonicalizeOAuthReturnPath,
  type OAuthTransaction,
  type OAuthTransactionConsumption,
  type OAuthTransactionRepository,
  validateOAuthStateHash,
} from "./oauth-transaction-repository";

const transactionRowSchema = z
  .object({
    id: z.uuid(),
    return_path: z.string(),
    created_at: z.iso.datetime({ offset: true }),
    expires_at: z.iso.datetime({ offset: true }),
  })
  .strict();

const consumptionResultSchema = z
  .array(
    z
      .object({
        outcome: z.enum(["consumed", "unknown", "expired", "already_consumed"]),
        return_path: z.string().nullable(),
      })
      .strict(),
  )
  .length(1);

export class OAuthTransactionStorageError extends Error {
  readonly code = "oauth_transaction_storage_failure";

  constructor() {
    super("OAuth transaction storage failure");
    this.name = "OAuthTransactionStorageError";
  }
}

export class SupabaseOAuthTransactionRepository implements OAuthTransactionRepository {
  constructor(
    private readonly createTransaction: OAuthTransactionCreateTransport,
    private readonly consumeTransaction: OAuthTransactionConsumeTransport,
  ) {}

  async create(input: { stateHash: string; returnPath: string }): Promise<OAuthTransaction> {
    const stateHash = validateOAuthStateHash(input.stateHash);
    const returnPath = canonicalizeOAuthReturnPath(input.returnPath);

    let response;
    try {
      response = await this.createTransaction({ state_hash: stateHash, return_path: returnPath });
    } catch {
      throw new OAuthTransactionStorageError();
    }
    if (response.error !== null) throw new OAuthTransactionStorageError();

    const parsed = transactionRowSchema.safeParse(response.data);
    if (!parsed.success) throw new OAuthTransactionStorageError();

    let storedReturnPath: string;
    try {
      storedReturnPath = canonicalizeOAuthReturnPath(parsed.data.return_path);
    } catch {
      throw new OAuthTransactionStorageError();
    }
    if (storedReturnPath !== returnPath) throw new OAuthTransactionStorageError();

    return {
      id: parsed.data.id,
      returnPath: storedReturnPath,
      createdAt: parsed.data.created_at,
      expiresAt: parsed.data.expires_at,
    };
  }

  async consume(stateHashInput: string): Promise<OAuthTransactionConsumption> {
    const stateHash = validateOAuthStateHash(stateHashInput);

    let response;
    try {
      response = await this.consumeTransaction({ p_state_hash: stateHash });
    } catch {
      throw new OAuthTransactionStorageError();
    }
    if (response.error !== null) throw new OAuthTransactionStorageError();

    const parsed = consumptionResultSchema.safeParse(response.data);
    if (!parsed.success) throw new OAuthTransactionStorageError();

    const result = parsed.data[0];
    if (result.outcome === "consumed") {
      if (result.return_path === null) throw new OAuthTransactionStorageError();
      try {
        return { outcome: "consumed", returnPath: canonicalizeOAuthReturnPath(result.return_path) };
      } catch {
        throw new OAuthTransactionStorageError();
      }
    }

    if (result.return_path !== null) throw new OAuthTransactionStorageError();
    return { outcome: result.outcome };
  }
}

export function createSupabaseOAuthTransactionRepository(): OAuthTransactionRepository {
  return new SupabaseOAuthTransactionRepository(createOAuthTransactionRow, consumeOAuthTransactionRpc);
}

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import {
  canonicalizeOAuthReturnPath,
  type OAuthTransactionConsumption,
  type OAuthTransactionRepository,
} from "./oauth-transaction-repository";

const OAUTH_STATE_BYTES = 32;

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export class OAuthStateService {
  constructor(
    private readonly repository: OAuthTransactionRepository,
    private readonly createRandomBytes: (size: number) => Buffer = randomBytes,
  ) {}

  async issue(returnPath: string): Promise<{
    state: string;
    transaction: { id: string; returnPath: string; createdAt: string; expiresAt: string };
  }> {
    const safeReturnPath = canonicalizeOAuthReturnPath(returnPath);
    const state = this.createRandomBytes(OAUTH_STATE_BYTES).toString("base64url");
    const transaction = await this.repository.create({
      stateHash: hashOAuthState(state),
      returnPath: safeReturnPath,
    });

    return { state, transaction };
  }

  async consume(state: string): Promise<OAuthTransactionConsumption> {
    return this.repository.consume(hashOAuthState(state));
  }
}

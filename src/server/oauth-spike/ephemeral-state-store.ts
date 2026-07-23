import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuthSpikeError } from "@/integrations/bitrix24/spike/errors";

const MAX_STATE_GENERATION_ATTEMPTS = 5;

export type EphemeralOAuthStateStoreOptions = {
  ttlMs?: number;
  now?: () => number;
  createRandomState?: () => string;
};

export class EphemeralOAuthStateStore {
  private readonly activeStates = new Map<string, number>();
  private readonly consumedStates = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly createRandomState: () => string;

  constructor(options: EphemeralOAuthStateStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.createRandomState = options.createRandomState ?? (() => randomBytes(32).toString("base64url"));
  }

  issue(): string {
    this.removeOldTombstones();
    for (let attempt = 0; attempt < MAX_STATE_GENERATION_ATTEMPTS; attempt += 1) {
      const state = this.createRandomState();
      if (!/^[A-Za-z0-9_-]{43}$/.test(state)) continue;
      const candidateHash = this.hash(state);
      if (
        this.findMatchingKey(this.activeStates, candidateHash) ||
        this.findMatchingKey(this.consumedStates, candidateHash)
      ) {
        continue;
      }
      this.activeStates.set(candidateHash, this.now() + this.ttlMs);
      return state;
    }
    throw new OAuthSpikeError("state_generation_failed");
  }

  consume(state: string): void {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state)) {
      throw new OAuthSpikeError("invalid_state");
    }
    const candidateHash = this.hash(state);
    if (this.findMatchingKey(this.consumedStates, candidateHash)) {
      throw new OAuthSpikeError("reused_state");
    }
    const key = this.findMatchingKey(this.activeStates, candidateHash);
    if (!key) throw new OAuthSpikeError("invalid_state");
    const expiresAt = this.activeStates.get(key);
    if (expiresAt === undefined) throw new OAuthSpikeError("invalid_state");

    this.activeStates.delete(key);
    this.consumedStates.set(key, this.now() + this.ttlMs);
    if (expiresAt <= this.now()) throw new OAuthSpikeError("expired_state");
  }

  snapshotHashes(): string[] {
    return [...this.activeStates.keys()];
  }

  snapshotConsumedHashes(): string[] {
    return [...this.consumedStates.keys()];
  }

  private hash(state: string): string {
    return createHash("sha256").update(state).digest("hex");
  }

  private findMatchingKey(states: Map<string, number>, candidateHash: string): string | undefined {
    const candidate = Buffer.from(candidateHash, "hex");
    for (const key of states.keys()) {
      if (timingSafeEqual(Buffer.from(key, "hex"), candidate)) return key;
    }
    return undefined;
  }

  private removeOldTombstones(): void {
    const now = this.now();
    for (const [key, expiresAt] of this.consumedStates) {
      if (expiresAt <= now) this.consumedStates.delete(key);
    }
  }
}

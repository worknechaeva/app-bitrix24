import { describe, expect, it } from "vitest";
import { EphemeralOAuthStateStore } from "@/server/oauth-spike/ephemeral-state-store";

describe("EphemeralOAuthStateStore", () => {
  it("issues different states and stores hashes only", () => {
    const store = new EphemeralOAuthStateStore();
    const first = store.issue();
    const second = store.issue();
    const hashes = store.snapshotHashes();

    expect(first).not.toBe(second);
    expect(hashes).toHaveLength(2);
    expect(hashes).not.toContain(first);
    expect(hashes).not.toContain(second);
    expect(hashes.every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(true);
  });

  it("atomically consumes a state and rejects reuse", async () => {
    const store = new EphemeralOAuthStateStore();
    const state = store.issue();
    const results = await Promise.allSettled([
      Promise.resolve().then(() => store.consume(state)),
      Promise.resolve().then(() => store.consume(state)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(store.snapshotHashes()).toHaveLength(0);
    expect(store.snapshotConsumedHashes()).toHaveLength(1);
    expect(() => store.consume(state)).toThrowError(expect.objectContaining({ reasonCode: "reused_state" }));
  });

  it("rejects unknown and expired states", () => {
    let now = 1_000;
    const store = new EphemeralOAuthStateStore({ ttlMs: 50, now: () => now });
    const state = store.issue();

    expect(() => store.consume("unknown")).toThrowError(
      expect.objectContaining({ reasonCode: "invalid_state" }),
    );
    now = 1_051;
    expect(() => store.consume(state)).toThrowError(expect.objectContaining({ reasonCode: "expired_state" }));
  });
});

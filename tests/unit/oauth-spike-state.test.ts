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

  it("regenerates after an active-state hash collision without overwriting it", () => {
    const first = "a".repeat(43);
    const second = "b".repeat(43);
    const generated = [first, first, second];
    const store = new EphemeralOAuthStateStore({
      createRandomState: () => generated.shift() ?? second,
    });

    expect(store.issue()).toBe(first);
    expect(store.issue()).toBe(second);
    expect(store.snapshotHashes()).toHaveLength(2);
    expect(() => store.consume(first)).not.toThrow();
    expect(() => store.consume(second)).not.toThrow();
  });

  it("regenerates after a consumed-state collision and fails safely after bounded attempts", () => {
    const first = "a".repeat(43);
    const second = "b".repeat(43);
    const generated = [first, first, second];
    const store = new EphemeralOAuthStateStore({
      createRandomState: () => generated.shift() ?? first,
    });

    expect(store.issue()).toBe(first);
    store.consume(first);
    expect(store.issue()).toBe(second);

    const exhaustedStore = new EphemeralOAuthStateStore({ createRandomState: () => first });
    expect(exhaustedStore.issue()).toBe(first);
    expect(() => exhaustedStore.issue()).toThrowError(
      expect.objectContaining({ reasonCode: "state_generation_failed" }),
    );
    expect(exhaustedStore.snapshotHashes()).toHaveLength(1);
  });
});

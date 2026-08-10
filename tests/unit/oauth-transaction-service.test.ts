import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { OAuthStateService, hashOAuthState } from "@/server/oauth/oauth-state-service";
import {
  canonicalizeOAuthReturnPath,
  OAuthTransactionInputError,
  type OAuthTransactionRepository,
} from "@/server/oauth/oauth-transaction-repository";

const timestamp = "2026-08-10T12:00:00.000Z";

function repositoryStub(): OAuthTransactionRepository {
  return {
    create: vi.fn(async ({ returnPath }) => ({
      id: "018f47a7-7c60-7a31-8f6a-27f4bb596f5a",
      returnPath,
      createdAt: timestamp,
      expiresAt: "2026-08-10T12:10:00.000Z",
    })),
    consume: vi.fn(async () => ({ outcome: "unknown" }) as const),
  };
}

describe("persistent OAuth state service", () => {
  it("requests 32 cryptographically random bytes and passes only their SHA-256 hash to storage", async () => {
    const repository = repositoryStub();
    const random = vi.fn(() => Buffer.alloc(32, 0xab));
    const service = new OAuthStateService(repository, random);

    const issued = await service.issue("/tasks?project=42#new");

    expect(random).toHaveBeenCalledExactlyOnceWith(32);
    expect(issued.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(repository.create).toHaveBeenCalledWith({
      stateHash: hashOAuthState(issued.state),
      returnPath: "/tasks?project=42#new",
    });
    expect(JSON.stringify(vi.mocked(repository.create).mock.calls)).not.toContain(issued.state);
  });

  it("hashes state deterministically with the full lowercase SHA-256 digest", () => {
    const state = "A-safe_synthetic-state";
    const expected = createHash("sha256").update(state, "utf8").digest("hex");

    expect(hashOAuthState(state)).toBe(expected);
    expect(hashOAuthState(state)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes callback state before crossing the repository boundary", async () => {
    const repository = repositoryStub();
    const service = new OAuthStateService(repository);
    const state = "callback_state_that_must_not_reach_storage";

    await service.consume(state);

    expect(repository.consume).toHaveBeenCalledExactlyOnceWith(hashOAuthState(state));
    expect(JSON.stringify(vi.mocked(repository.consume).mock.calls)).not.toContain(state);
  });

  it.each([
    ["/", "/"],
    ["/tasks", "/tasks"],
    ["/tasks?project=42#new", "/tasks?project=42#new"],
    ["/a path", "/a%20path"],
  ])("accepts and canonicalizes internal return path %s", (input, expected) => {
    expect(canonicalizeOAuthReturnPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example/path",
    "http://evil.example/path",
    "//evil.example/path",
    "javascript:alert(1)",
    "/\\evil.example/path",
    "/%5cevil.example/path",
    "/%2fevil.example/path",
    "/%252fevil.example/path",
    "/tasks\nnext",
    "/tasks%0anext",
  ])("rejects unsafe return path %s", (returnPath) => {
    expect(() => canonicalizeOAuthReturnPath(returnPath)).toThrow(OAuthTransactionInputError);
  });
});

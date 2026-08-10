import { describe, expect, it, vi } from "vitest";
import { OAuthTransactionInputError } from "@/server/oauth/oauth-transaction-repository";
import {
  OAuthTransactionStorageError,
  SupabaseOAuthTransactionRepository,
} from "@/server/oauth/supabase-oauth-transaction-repository";

const stateHash = "a".repeat(64);
const timestamp = "2026-08-10T12:00:00.000Z";
const transactionRow = {
  id: "018f47a7-7c60-7a31-8f6a-27f4bb596f5a",
  return_path: "/tasks",
  created_at: timestamp,
  expires_at: "2026-08-10T12:10:00.000Z",
};

describe("Supabase OAuth transaction repository", () => {
  it("creates by hash and maps the database-owned timestamps", async () => {
    const create = vi.fn().mockResolvedValue({ data: transactionRow, error: null });
    const consume = vi.fn();
    const repository = new SupabaseOAuthTransactionRepository(create, consume);

    await expect(repository.create({ stateHash, returnPath: "/tasks" })).resolves.toEqual({
      id: transactionRow.id,
      returnPath: "/tasks",
      createdAt: timestamp,
      expiresAt: transactionRow.expires_at,
    });
    expect(create).toHaveBeenCalledWith({ state_hash: stateHash, return_path: "/tasks" });
  });

  it.each([
    ["consumed", "/tasks", { outcome: "consumed", returnPath: "/tasks" }],
    ["unknown", null, { outcome: "unknown" }],
    ["expired", null, { outcome: "expired" }],
    ["already_consumed", null, { outcome: "already_consumed" }],
  ] as const)("maps %s consumption", async (outcome, returnPath, expected) => {
    const create = vi.fn();
    const consume = vi.fn().mockResolvedValue({
      data: [{ outcome, return_path: returnPath }],
      error: null,
    });
    const repository = new SupabaseOAuthTransactionRepository(create, consume);

    await expect(repository.consume(stateHash)).resolves.toEqual(expected);
    expect(consume).toHaveBeenCalledWith({ p_state_hash: stateHash });
  });

  it.each([
    { stateHash: "raw-state-is-not-a-sha256-digest", returnPath: "/tasks" },
    { stateHash, returnPath: "https://evil.example" },
    { stateHash, returnPath: "//evil.example" },
  ])("rejects unsafe create input before transport", async (input) => {
    const create = vi.fn();
    const repository = new SupabaseOAuthTransactionRepository(create, vi.fn());

    await expect(repository.create(input)).rejects.toBeInstanceOf(OAuthTransactionInputError);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    () => Promise.reject(new Error("raw-state-and-service-role-key-must-not-escape")),
    () => Promise.resolve({ data: null, error: { message: "raw-state in SQL error" } }),
    () => Promise.resolve({ data: [], error: null }),
  ])("normalizes create failures without diagnostic details", async (create) => {
    const repository = new SupabaseOAuthTransactionRepository(create, vi.fn());

    let thrown: unknown;
    try {
      await repository.create({ stateHash, returnPath: "/tasks" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining<Partial<OAuthTransactionStorageError>>({
        code: "oauth_transaction_storage_failure",
        message: "OAuth transaction storage failure",
      }),
    );
    expect(String(thrown)).not.toContain("raw-state");
    expect(String(thrown)).not.toContain("service-role-key");
    expect(String(thrown)).not.toContain("SQL error");
  });

  it("fails closed when a non-consumed result exposes a return path", async () => {
    const repository = new SupabaseOAuthTransactionRepository(
      vi.fn(),
      vi.fn().mockResolvedValue({
        data: [{ outcome: "expired", return_path: "/must-not-leak" }],
        error: null,
      }),
    );

    await expect(repository.consume(stateHash)).rejects.toBeInstanceOf(OAuthTransactionStorageError);
  });
});

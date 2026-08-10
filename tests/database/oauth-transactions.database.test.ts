import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { OAuthStateService, hashOAuthState } from "@/server/oauth/oauth-state-service";
import { createSupabaseOAuthTransactionRepository } from "@/server/oauth/supabase-oauth-transaction-repository";

function requiredEnvironment(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`Missing database test environment: ${name}`);
  return value;
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;
const serviceClient = createClient(
  requiredEnvironment("SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  clientOptions,
);
const anonClient = createClient(
  requiredEnvironment("SUPABASE_URL"),
  requiredEnvironment("SUPABASE_ANON_KEY"),
  clientOptions,
);

const invalidDirectRows: Array<Record<string, string>> = [
  { state_hash: "not-a-hash", return_path: "/safe" },
  { state_hash: "b".repeat(64), return_path: "https://evil.example" },
  { state_hash: "c".repeat(64), return_path: "//evil.example" },
  { state_hash: "d".repeat(64), return_path: "/\\evil.example" },
  { state_hash: "e".repeat(64), return_path: "/line\nbreak" },
  { state_hash: "2".repeat(64), return_path: "/%252fevil.example" },
  {
    state_hash: "f".repeat(64),
    return_path: "/safe",
    created_at: "2026-08-10T10:00:00.000Z",
    expires_at: "2026-08-10T10:00:00.000Z",
  },
  {
    state_hash: "1".repeat(64),
    return_path: "/safe",
    created_at: "2026-08-10T10:00:00.000Z",
    consumed_at: "2026-08-10T09:59:59.000Z",
  },
];

describe("oauth_transactions database foundation", () => {
  it("stores only a hash with an exact database-owned ten-minute TTL and consumes once", async () => {
    const repository = createSupabaseOAuthTransactionRepository();
    const service = new OAuthStateService(repository);
    const issued = await service.issue("/tasks?project=42#new");
    const stateHash = hashOAuthState(issued.state);

    const { data: stored, error: readError } = await serviceClient
      .from("oauth_transactions")
      .select("state_hash,return_path,created_at,expires_at,consumed_at")
      .eq("state_hash", stateHash)
      .single();
    expect(readError).toBeNull();
    expect(stored).toMatchObject({
      state_hash: stateHash,
      return_path: "/tasks?project=42#new",
      consumed_at: null,
    });
    expect(stored!.state_hash).not.toBe(issued.state);
    expect(new Date(stored!.expires_at).getTime() - new Date(stored!.created_at).getTime()).toBe(600_000);

    await expect(service.consume(issued.state)).resolves.toEqual({
      outcome: "consumed",
      returnPath: "/tasks?project=42#new",
    });
    await expect(service.consume(issued.state)).resolves.toEqual({ outcome: "already_consumed" });
    await expect(service.consume("unknown-state")).resolves.toEqual({ outcome: "unknown" });
  });

  it("returns expired without consuming or exposing the return path", async () => {
    const repository = createSupabaseOAuthTransactionRepository();
    const state = "expired-synthetic-state";
    const stateHash = hashOAuthState(state);
    const { error: insertError } = await serviceClient.from("oauth_transactions").insert({
      state_hash: stateHash,
      return_path: "/expired",
      created_at: "2026-08-10T10:00:00.000Z",
      expires_at: "2026-08-10T10:10:00.000Z",
    });
    expect(insertError).toBeNull();

    await expect(repository.consume(stateHash)).resolves.toEqual({ outcome: "expired" });
    const { data: stored, error: readError } = await serviceClient
      .from("oauth_transactions")
      .select("consumed_at")
      .eq("state_hash", stateHash)
      .single();
    expect(readError).toBeNull();
    expect(stored!.consumed_at).toBeNull();
  });

  it("allows exactly one successful consumer across sixteen real database calls", async () => {
    const repository = createSupabaseOAuthTransactionRepository();
    const service = new OAuthStateService(repository);
    const issued = await service.issue("/concurrent");
    const results = await Promise.all(Array.from({ length: 16 }, () => service.consume(issued.state)));

    expect(results.filter((result) => result.outcome === "consumed")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "already_consumed")).toHaveLength(15);

    const { data: rows, error: readError } = await serviceClient
      .from("oauth_transactions")
      .select("id,consumed_at")
      .eq("state_hash", hashOAuthState(issued.state));
    expect(readError).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0]!.consumed_at).not.toBeNull();
  });

  it.each(invalidDirectRows)("rejects invalid direct row %#", async (row) => {
    const { error } = await serviceClient.from("oauth_transactions").insert(row);
    expect(error?.code).toBe("23514");
  });

  it("denies browser-role table and RPC access", async () => {
    const { error: tableError } = await anonClient.from("oauth_transactions").select("id");
    expect(tableError?.code).toBe("42501");
    const { error: rpcError } = await anonClient.rpc("consume_oauth_transaction", {
      p_state_hash: "a".repeat(64),
    });
    expect(rpcError).not.toBeNull();
  });
});

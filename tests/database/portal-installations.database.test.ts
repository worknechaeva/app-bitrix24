import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { PortalInstallationIdentityError } from "@/server/portal/portal-installation-repository";
import { createSupabasePortalInstallationRepository } from "@/server/portal/supabase-portal-installation-repository";

const memberA = "a".repeat(32);
const memberB = "b".repeat(32);

function requiredEnvironment(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY" | "SUPABASE_ANON_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`Missing database test environment: ${name}`);
  return value;
}

const supabaseUrl = requiredEnvironment("SUPABASE_URL");
const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const anonKey = requiredEnvironment("SUPABASE_ANON_KEY");
const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

describe("portal_installations database reconciliation", () => {
  it("preserves one installation across creation, updates, mismatches, and concurrent calls", async () => {
    const repository = createSupabasePortalInstallationRepository();
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, clientOptions);
    const anonClient = createClient(supabaseUrl, anonKey, clientOptions);

    const concurrentIdentities = Array.from({ length: 12 }, (_, index) =>
      index % 2 === 0
        ? { memberId: memberA, portalOrigin: "https://portal-a.example" }
        : { memberId: memberB, portalOrigin: "https://portal-b.example" },
    );
    const concurrentResults = await Promise.allSettled(
      concurrentIdentities.map((identity) => repository.reconcileTrustedIdentity(identity)),
    );
    const fulfilled = concurrentResults.filter((result) => result.status === "fulfilled");
    const rejected = concurrentResults.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(6);
    expect(rejected).toHaveLength(6);
    expect(
      fulfilled.filter((result) => result.status === "fulfilled" && result.value.outcome === "created"),
    ).toHaveLength(1);
    expect(
      rejected.every(
        (result) =>
          result.status === "rejected" &&
          result.reason instanceof PortalInstallationIdentityError &&
          result.reason.code === "portal_installation_mismatch",
      ),
    ).toBe(true);

    const { data: initialRows, error: initialReadError } = await serviceClient
      .from("portal_installations")
      .select("singleton_key,member_id,portal_origin,created_at,updated_at");
    expect(initialReadError).toBeNull();
    expect(initialRows).toHaveLength(1);

    const initial = initialRows![0];
    const winningMemberId = initial.member_id;
    const losingMemberId = winningMemberId === memberA ? memberB : memberA;
    const originalOrigin = initial.portal_origin;

    await expect(
      repository.reconcileTrustedIdentity({ memberId: winningMemberId, portalOrigin: originalOrigin }),
    ).resolves.toMatchObject({ outcome: "unchanged" });

    const { data: unchangedRow, error: unchangedReadError } = await serviceClient
      .from("portal_installations")
      .select("updated_at")
      .single();
    expect(unchangedReadError).toBeNull();
    expect(unchangedRow!.updated_at).toBe(initial.updated_at);

    const renamedOrigin = "https://renamed.example";
    await expect(
      repository.reconcileTrustedIdentity({ memberId: winningMemberId, portalOrigin: renamedOrigin }),
    ).resolves.toEqual({
      outcome: "origin_updated",
      installation: { memberId: winningMemberId, portalOrigin: renamedOrigin },
      previousPortalOrigin: originalOrigin,
    });

    const { data: updatedRows, error: updatedReadError } = await serviceClient
      .from("portal_installations")
      .select("singleton_key,member_id,portal_origin,created_at,updated_at");
    expect(updatedReadError).toBeNull();
    expect(updatedRows).toHaveLength(1);
    expect(updatedRows![0]).toMatchObject({
      singleton_key: 1,
      member_id: winningMemberId,
      portal_origin: renamedOrigin,
      created_at: initial.created_at,
    });
    expect(new Date(updatedRows![0].updated_at).getTime()).toBeGreaterThan(
      new Date(initial.updated_at).getTime(),
    );

    await expect(
      repository.reconcileTrustedIdentity({
        memberId: losingMemberId,
        portalOrigin: "https://other.example",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PortalInstallationIdentityError>>({
        code: "portal_installation_mismatch",
      }),
    );

    const { error: secondSingletonError } = await serviceClient.from("portal_installations").insert({
      singleton_key: 2,
      member_id: losingMemberId,
      portal_origin: "https://other.example",
    });
    expect(secondSingletonError?.code).toBe("23514");

    const { error: anonTableError } = await anonClient.from("portal_installations").select("member_id");
    expect(anonTableError?.code).toBe("42501");

    const { error: anonRpcError } = await anonClient.rpc("reconcile_portal_installation", {
      p_member_id: winningMemberId,
      p_portal_origin: renamedOrigin,
    });
    expect(anonRpcError).not.toBeNull();

    const { count, error: finalReadError } = await serviceClient
      .from("portal_installations")
      .select("singleton_key", { count: "exact", head: true });
    expect(finalReadError).toBeNull();
    expect(count).toBe(1);
  });
});

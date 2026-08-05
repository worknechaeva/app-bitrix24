import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { PortalInstallationIdentityError } from "@/server/portal/portal-installation-repository";
import { createSupabasePortalInstallationRepository } from "@/server/portal/supabase-portal-installation-repository";
import { createSupabaseProfileRepository } from "@/server/profile/supabase-profile-repository";

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

  it("reconciles profiles atomically while preserving local access state", async () => {
    const repository = createSupabaseProfileRepository();
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, clientOptions);
    const anonClient = createClient(supabaseUrl, anonKey, clientOptions);
    const verifiedEmployee = {
      portalInstallationId: 1,
      user: { id: "42", active: true, userType: "employee" },
    } as const;

    const created = await repository.reconcileVerifiedEmployee(verifiedEmployee);
    expect(created).toMatchObject({
      outcome: "created",
      profile: {
        portalInstallationId: 1,
        bitrixUserId: "42",
        role: "editor",
        isActive: true,
        identitySnapshot: { active: true, userType: "employee" },
      },
    });

    const repeated = await repository.reconcileVerifiedEmployee(verifiedEmployee);
    expect(repeated).toMatchObject({ outcome: "unchanged", profile: { id: created.profile.id } });
    expect(repeated.profile.updatedAt).toBe(created.profile.updatedAt);

    const { count: repeatedCount, error: repeatedCountError } = await serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("portal_installation_id", 1)
      .eq("bitrix_user_id", "42");
    expect(repeatedCountError).toBeNull();
    expect(repeatedCount).toBe(1);

    const { error: driftError } = await serviceClient
      .from("profiles")
      .update({ bitrix_active: false, bitrix_user_type: "stale_snapshot", role: "administrator" })
      .eq("id", created.profile.id);
    expect(driftError).toBeNull();

    const snapshotUpdated = await repository.reconcileVerifiedEmployee(verifiedEmployee);
    expect(snapshotUpdated).toMatchObject({
      outcome: "snapshot_updated",
      profile: {
        id: created.profile.id,
        role: "administrator",
        isActive: true,
        identitySnapshot: { active: true, userType: "employee" },
      },
    });
    expect(new Date(snapshotUpdated.profile.updatedAt).getTime()).toBeGreaterThan(
      new Date(created.profile.updatedAt).getTime(),
    );

    const { error: deactivateError } = await serviceClient
      .from("profiles")
      .update({ is_active: false })
      .eq("id", created.profile.id);
    expect(deactivateError).toBeNull();

    await expect(repository.reconcileVerifiedEmployee(verifiedEmployee)).resolves.toMatchObject({
      outcome: "inactive",
      profile: { id: created.profile.id, role: "administrator", isActive: false },
    });

    await expect(
      repository.reconcileVerifiedEmployee({
        portalInstallationId: 1,
        user: { id: "43", active: true, userType: "employee" },
      }),
    ).resolves.toMatchObject({ outcome: "created", profile: { bitrixUserId: "43" } });

    const { error: duplicateError } = await serviceClient.from("profiles").insert({
      portal_installation_id: 1,
      bitrix_user_id: "43",
      bitrix_active: true,
      bitrix_user_type: "employee",
    });
    expect(duplicateError?.code).toBe("23505");

    const { error: foreignKeyError } = await serviceClient.from("profiles").insert({
      portal_installation_id: 2,
      bitrix_user_id: "44",
      bitrix_active: true,
      bitrix_user_type: "employee",
    });
    expect(foreignKeyError?.code).toBe("23503");

    const concurrentIdentity = {
      portalInstallationId: 1,
      user: { id: "99", active: true, userType: "employee" },
    } as const;
    const concurrentResults = await Promise.all(
      Array.from({ length: 16 }, () => repository.reconcileVerifiedEmployee(concurrentIdentity)),
    );
    expect(concurrentResults.filter((result) => result.outcome === "created")).toHaveLength(1);
    expect(concurrentResults.every((result) => result.profile.id === concurrentResults[0]!.profile.id)).toBe(
      true,
    );
    expect(
      concurrentResults.every((result) => result.outcome === "created" || result.outcome === "unchanged"),
    ).toBe(true);

    const { count: concurrentCount, error: concurrentCountError } = await serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("portal_installation_id", 1)
      .eq("bitrix_user_id", "99");
    expect(concurrentCountError).toBeNull();
    expect(concurrentCount).toBe(1);

    const { error: anonTableError } = await anonClient.from("profiles").select("id");
    expect(anonTableError?.code).toBe("42501");
    const { error: anonRpcError } = await anonClient.rpc("reconcile_profile", {
      p_portal_installation_id: 1,
      p_bitrix_user_id: "100",
      p_bitrix_active: true,
      p_bitrix_user_type: "employee",
    });
    expect(anonRpcError).not.toBeNull();
  });
});

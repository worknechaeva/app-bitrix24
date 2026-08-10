import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { AppSessionService, hashAppSessionToken } from "@/server/auth/app-session-service";
import { createSupabaseAppSessionRepository } from "@/server/auth/supabase-app-session-repository";
import { createSupabaseProfileRepository } from "@/server/profile/supabase-profile-repository";

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

const profileRepository = createSupabaseProfileRepository();
const sessionRepository = createSupabaseAppSessionRepository();
const sessionService = new AppSessionService(sessionRepository);

async function createProfile(bitrixUserId: string) {
  return (
    await profileRepository.reconcileVerifiedEmployee({
      portalInstallationId: 1,
      user: { id: bitrixUserId, active: true, userType: "employee" },
    })
  ).profile;
}

describe.sequential("app_sessions database foundation", () => {
  beforeAll(async () => {
    const { error } = await serviceClient.rpc("reconcile_portal_installation", {
      p_member_id: "a".repeat(32),
      p_portal_origin: "https://portal-a.example",
    });
    expect(error).toBeNull();
  });

  it("creates an active profile session with database-owned exact TTL and hash-only storage", async () => {
    const profile = await createProfile("7001");
    const issued = await sessionService.issue({ portalInstallationId: 1, profileId: profile.id });
    expect(issued.outcome).toBe("created");
    if (issued.outcome !== "created") throw new Error("Expected a created session");

    const tokenHash = hashAppSessionToken(issued.token);
    const { data: stored, error: readError } = await serviceClient
      .from("app_sessions")
      .select("id,profile_id,portal_installation_id,token_hash,created_at,expires_at,revoked_at")
      .eq("id", issued.session.id)
      .single();
    expect(readError).toBeNull();
    expect(stored).toMatchObject({
      profile_id: profile.id,
      portal_installation_id: 1,
      token_hash: tokenHash,
      revoked_at: null,
    });
    expect(stored!.token_hash).not.toBe(issued.token);
    expect(new Date(stored!.expires_at).getTime() - new Date(stored!.created_at).getTime()).toBe(
      30 * 24 * 60 * 60 * 1000,
    );
    expect(Object.keys(stored!)).not.toContain("role");

    const resolved = await sessionService.resolve(issued.token);
    expect(resolved).toEqual({
      outcome: "active",
      actor: {
        sessionId: issued.session.id,
        profileId: profile.id,
        portalInstallationId: 1,
        role: "editor",
        expiresAt: stored!.expires_at,
      },
    });

    const { error: promoteError } = await serviceClient
      .from("profiles")
      .update({ role: "administrator" })
      .eq("id", profile.id);
    expect(promoteError).toBeNull();
    await expect(sessionService.resolve(issued.token)).resolves.toMatchObject({
      outcome: "active",
      actor: { role: "administrator" },
    });

    const { data: unchanged, error: unchangedError } = await serviceClient
      .from("app_sessions")
      .select("created_at,expires_at")
      .eq("id", issued.session.id)
      .single();
    expect(unchangedError).toBeNull();
    expect(unchanged).toEqual({ created_at: stored!.created_at, expires_at: stored!.expires_at });
  });

  it("rejects unknown, inactive, inadmissible, and cross-portal profiles", async () => {
    await expect(
      sessionRepository.create({
        portalInstallationId: 1,
        profileId: "218f47a7-7c60-7a31-8f6a-27f4bb596f5a",
        tokenHash: "1".repeat(64),
      }),
    ).resolves.toEqual({ outcome: "profile_unknown" });

    const inactiveProfile = await createProfile("7002");
    const { error: deactivateError } = await serviceClient
      .from("profiles")
      .update({ is_active: false })
      .eq("id", inactiveProfile.id);
    expect(deactivateError).toBeNull();
    await expect(
      sessionService.issue({ portalInstallationId: 1, profileId: inactiveProfile.id }),
    ).resolves.toEqual({ outcome: "profile_inactive" });

    const inadmissibleProfile = await createProfile("7003");
    const { error: driftError } = await serviceClient
      .from("profiles")
      .update({ bitrix_active: false })
      .eq("id", inadmissibleProfile.id);
    expect(driftError).toBeNull();
    await expect(
      sessionService.issue({ portalInstallationId: 1, profileId: inadmissibleProfile.id }),
    ).resolves.toEqual({ outcome: "profile_inactive" });

    const { data: mismatch, error: mismatchError } = await serviceClient.rpc("create_app_session", {
      p_portal_installation_id: 2,
      p_profile_id: inactiveProfile.id,
      p_token_hash: "2".repeat(64),
    });
    expect(mismatchError).toBeNull();
    expect(mismatch).toEqual([
      {
        outcome: "profile_unknown",
        session_id: null,
        profile_id: null,
        portal_installation_id: null,
        created_at: null,
        expires_at: null,
      },
    ]);
  });

  it("returns safe unknown, expired, revoked, and profile_inactive resolutions", async () => {
    const unknownToken = Buffer.alloc(32, 0x21).toString("base64url");
    await expect(sessionService.resolve(unknownToken)).resolves.toEqual({ outcome: "unknown" });

    const expiredProfile = await createProfile("7004");
    const expiredToken = Buffer.alloc(32, 0x22).toString("base64url");
    const { error: expiredInsertError } = await serviceClient.from("app_sessions").insert({
      portal_installation_id: 1,
      profile_id: expiredProfile.id,
      token_hash: hashAppSessionToken(expiredToken),
      created_at: "2020-01-01T00:00:00.000Z",
      expires_at: "2020-01-31T00:00:00.000Z",
    });
    expect(expiredInsertError).toBeNull();
    await expect(sessionService.resolve(expiredToken)).resolves.toEqual({ outcome: "expired" });
    await expect(sessionService.revoke(expiredToken)).resolves.toEqual({ outcome: "expired" });

    const revokedProfile = await createProfile("7005");
    const revoked = await sessionService.issue({ portalInstallationId: 1, profileId: revokedProfile.id });
    expect(revoked.outcome).toBe("created");
    if (revoked.outcome !== "created") throw new Error("Expected a created session");
    await expect(sessionService.revoke(revoked.token)).resolves.toEqual({ outcome: "revoked" });
    await expect(sessionService.resolve(revoked.token)).resolves.toEqual({ outcome: "revoked" });

    const deactivatedProfile = await createProfile("7006");
    const deactivated = await sessionService.issue({
      portalInstallationId: 1,
      profileId: deactivatedProfile.id,
    });
    expect(deactivated.outcome).toBe("created");
    if (deactivated.outcome !== "created") throw new Error("Expected a created session");
    const { error: deactivateError } = await serviceClient
      .from("profiles")
      .update({ is_active: false })
      .eq("id", deactivatedProfile.id);
    expect(deactivateError).toBeNull();
    await expect(sessionService.resolve(deactivated.token)).resolves.toEqual({
      outcome: "profile_inactive",
    });
  });

  it("revokes once across sixteen concurrent database calls and preserves the timestamp", async () => {
    const profile = await createProfile("7007");
    const issued = await sessionService.issue({ portalInstallationId: 1, profileId: profile.id });
    expect(issued.outcome).toBe("created");
    if (issued.outcome !== "created") throw new Error("Expected a created session");

    const results = await Promise.all(Array.from({ length: 16 }, () => sessionService.revoke(issued.token)));
    expect(results.filter((result) => result.outcome === "revoked")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "already_revoked")).toHaveLength(15);

    const { data: firstRead, error: firstReadError } = await serviceClient
      .from("app_sessions")
      .select("revoked_at")
      .eq("id", issued.session.id)
      .single();
    expect(firstReadError).toBeNull();
    expect(firstRead!.revoked_at).not.toBeNull();

    await expect(sessionService.revoke(issued.token)).resolves.toEqual({ outcome: "already_revoked" });
    const { data: secondRead, error: secondReadError } = await serviceClient
      .from("app_sessions")
      .select("revoked_at")
      .eq("id", issued.session.id)
      .single();
    expect(secondReadError).toBeNull();
    expect(secondRead!.revoked_at).toBe(firstRead!.revoked_at);
    await expect(sessionService.resolve(issued.token)).resolves.toEqual({ outcome: "revoked" });
  });

  it("enforces direct-row constraints and denies browser table and RPC access", async () => {
    const profile = await createProfile("7008");
    const invalidRows: Array<{
      portal_installation_id: number;
      profile_id: string;
      token_hash: string;
      created_at?: string;
      expires_at?: string;
      revoked_at?: string;
    }> = [
      {
        portal_installation_id: 1,
        profile_id: profile.id,
        token_hash: "not-a-hash",
      },
      {
        portal_installation_id: 1,
        profile_id: profile.id,
        token_hash: "3".repeat(64),
        created_at: "2026-08-10T00:00:00.000Z",
        expires_at: "2026-08-11T00:00:00.000Z",
      },
      {
        portal_installation_id: 1,
        profile_id: profile.id,
        token_hash: "4".repeat(64),
        created_at: "2026-08-10T00:00:00.000Z",
        expires_at: "2026-09-09T00:00:00.000Z",
        revoked_at: "2026-08-09T23:59:59.000Z",
      },
    ];

    for (const row of invalidRows) {
      const { error } = await serviceClient.from("app_sessions").insert(row);
      expect(error?.code).toBe("23514");
    }

    const { error: tableError } = await anonClient.from("app_sessions").select("id");
    expect(tableError?.code).toBe("42501");
    const { error: createError } = await anonClient.rpc("create_app_session", {
      p_portal_installation_id: 1,
      p_profile_id: profile.id,
      p_token_hash: "5".repeat(64),
    });
    expect(createError).not.toBeNull();
    const { error: resolveError } = await anonClient.rpc("resolve_app_session", {
      p_token_hash: "5".repeat(64),
    });
    expect(resolveError).not.toBeNull();
    const { error: revokeError } = await anonClient.rpc("revoke_app_session", {
      p_token_hash: "5".repeat(64),
    });
    expect(revokeError).not.toBeNull();
  });
});

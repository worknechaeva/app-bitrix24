import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { Bitrix24CredentialCrypto } from "@/server/credentials/bitrix24-credential-crypto";
import { Bitrix24CredentialService } from "@/server/credentials/bitrix24-credential-service";
import { createSupabaseBitrix24CredentialRepository } from "@/server/credentials/supabase-bitrix24-credential-repository";
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
const credentialRepository = createSupabaseBitrix24CredentialRepository();
// Synthetic and explicitly test-only. It is never used by production configuration.
const TEST_ONLY_ENCRYPTION_KEY = Buffer.alloc(32, 0x5a);
const crypto = new Bitrix24CredentialCrypto(TEST_ONLY_ENCRYPTION_KEY);
const credentialService = new Bitrix24CredentialService(credentialRepository, crypto);
const endpoint = "https://credentials-test.example/rest/";

async function createProfile(bitrixUserId: string) {
  return (
    await profileRepository.reconcileVerifiedEmployee({
      portalInstallationId: 1,
      user: { id: bitrixUserId, active: true, userType: "employee" },
    })
  ).profile;
}

async function setProfileInactive(profileId: string) {
  const { error } = await serviceClient.from("profiles").update({ is_active: false }).eq("id", profileId);
  expect(error).toBeNull();
}

async function setCredentialStatus(profileId: string, status: "disabled" | "reauth_required") {
  const values =
    status === "reauth_required"
      ? { status, reauth_required_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { status, reauth_required_at: null, updated_at: new Date().toISOString() };
  const { error } = await serviceClient
    .from("bitrix24_user_credentials")
    .update(values)
    .eq("profile_id", profileId);
  expect(error).toBeNull();
}

describe.sequential("bitrix24_user_credentials database foundation", () => {
  beforeAll(async () => {
    const { data: installations, error: readError } = await serviceClient
      .from("portal_installations")
      .select("member_id")
      .limit(1);
    expect(readError).toBeNull();
    if (installations?.length === 0) {
      const { error } = await serviceClient.rpc("reconcile_portal_installation", {
        p_member_id: "a".repeat(32),
        p_portal_origin: "https://portal-a.example",
      });
      expect(error).toBeNull();
    }
  });

  it("creates initial active credentials with encrypted-only storage and resolves them server-side", async () => {
    const profile = await createProfile("8101");
    const accessToken = "synthetic-access-token-8101";
    const refreshToken = "synthetic-refresh-token-8101";
    const expiresAt = "2026-08-11T12:00:00.000Z";

    const created = await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: profile.id,
      accessToken,
      refreshToken,
      clientEndpoint: endpoint,
      accessTokenExpiresAt: expiresAt,
    });
    expect(created.outcome).toBe("created");
    if (created.outcome !== "created") throw new Error("Expected credentials creation");
    expect(created.credential.tokenVersion).toBe(1);

    const { data: stored, error } = await serviceClient
      .from("bitrix24_user_credentials")
      .select("*")
      .eq("profile_id", profile.id)
      .single();
    expect(error).toBeNull();
    expect(stored).toMatchObject({
      id: created.credential.id,
      portal_installation_id: 1,
      profile_id: profile.id,
      encryption_version: 1,
      token_version: 1,
      client_endpoint: endpoint,
      status: "active",
      reauth_required_at: null,
    });
    expect(new Date(stored!.access_token_expires_at).toISOString()).toBe(expiresAt);
    expect(stored!.access_token_iv).not.toBe(stored!.refresh_token_iv);
    expect(JSON.stringify(stored)).not.toContain(accessToken);
    expect(JSON.stringify(stored)).not.toContain(refreshToken);
    expect(JSON.stringify(stored)).not.toContain(TEST_ONLY_ENCRYPTION_KEY.toString("base64"));
    expect(Object.keys(stored!)).not.toContain("encryption_key");

    const resolved = await credentialService.resolve({ portalInstallationId: 1, profileId: profile.id });
    expect(resolved).toMatchObject({
      outcome: "active",
      accessToken,
      refreshToken,
      clientEndpoint: endpoint,
      tokenVersion: 1,
    });
    if (resolved.outcome !== "active") throw new Error("Expected active credentials");
    expect(new Date(resolved.accessTokenExpiresAt!).toISOString()).toBe(expiresAt);

    await expect(
      credentialService.createInitial({
        portalInstallationId: 1,
        profileId: profile.id,
        accessToken: "replacement-access-must-not-win",
        refreshToken: "replacement-refresh-must-not-win",
        clientEndpoint: endpoint,
      }),
    ).resolves.toEqual({ outcome: "already_exists" });
    await expect(
      credentialService.resolve({ portalInstallationId: 1, profileId: profile.id }),
    ).resolves.toMatchObject({ outcome: "active", accessToken, refreshToken, tokenVersion: 1 });
  });

  it("rejects unknown, inactive, and cross-portal profiles without creating a row", async () => {
    const unknownProfileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
    await expect(
      credentialService.createInitial({
        portalInstallationId: 1,
        profileId: unknownProfileId,
        accessToken: "unknown-access",
        refreshToken: "unknown-refresh",
        clientEndpoint: endpoint,
      }),
    ).resolves.toEqual({ outcome: "profile_unknown" });

    const inactive = await createProfile("8102");
    await setProfileInactive(inactive.id);
    await expect(
      credentialService.createInitial({
        portalInstallationId: 1,
        profileId: inactive.id,
        accessToken: "inactive-access",
        refreshToken: "inactive-refresh",
        clientEndpoint: endpoint,
      }),
    ).resolves.toEqual({ outcome: "profile_inactive" });

    const pair = crypto.encryptTokenPair({
      accessToken: "cross-access",
      refreshToken: "cross-refresh",
      portalInstallationId: 1,
      profileId: inactive.id,
      tokenVersion: 1,
    });
    const { data: mismatch, error: mismatchError } = await serviceClient.rpc(
      "create_bitrix24_user_credentials",
      {
        p_portal_installation_id: 2,
        p_profile_id: inactive.id,
        p_access_token_ciphertext: pair.encryptedAccessToken.ciphertext,
        p_access_token_iv: pair.encryptedAccessToken.iv,
        p_access_token_auth_tag: pair.encryptedAccessToken.authTag,
        p_refresh_token_ciphertext: pair.encryptedRefreshToken.ciphertext,
        p_refresh_token_iv: pair.encryptedRefreshToken.iv,
        p_refresh_token_auth_tag: pair.encryptedRefreshToken.authTag,
        p_encryption_version: 1,
        p_client_endpoint: endpoint,
        p_access_token_expires_at: null,
      },
    );
    expect(mismatchError).toBeNull();
    expect(mismatch?.[0]?.outcome).toBe("profile_unknown");
    const { count } = await serviceClient
      .from("bitrix24_user_credentials")
      .select("id", { count: "exact", head: true })
      .in("profile_id", [unknownProfileId, inactive.id]);
    expect(count).toBe(0);
  });

  it("returns safe non-active resolve outcomes without encrypted fields or decryption", async () => {
    await expect(
      credentialService.resolve({
        portalInstallationId: 1,
        profileId: "118f47a7-7c60-7a31-8f6a-27f4bb596f5a",
      }),
    ).resolves.toEqual({ outcome: "unknown" });

    const inactive = await createProfile("8103");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: inactive.id,
      accessToken: "inactive-resolve-access",
      refreshToken: "inactive-resolve-refresh",
      clientEndpoint: endpoint,
    });
    await setProfileInactive(inactive.id);
    await expect(
      credentialRepository.resolve({ portalInstallationId: 1, profileId: inactive.id }),
    ).resolves.toEqual({ outcome: "profile_inactive" });

    const reauth = await createProfile("8104");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: reauth.id,
      accessToken: "reauth-access",
      refreshToken: "reauth-refresh",
      clientEndpoint: endpoint,
    });
    await setCredentialStatus(reauth.id, "reauth_required");
    await expect(
      credentialRepository.resolve({ portalInstallationId: 1, profileId: reauth.id }),
    ).resolves.toEqual({ outcome: "reauth_required" });

    const disabled = await createProfile("8105");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: disabled.id,
      accessToken: "disabled-access",
      refreshToken: "disabled-refresh",
      clientEndpoint: endpoint,
    });
    await setCredentialStatus(disabled.id, "disabled");
    await expect(
      credentialRepository.resolve({ portalInstallationId: 1, profileId: disabled.id }),
    ).resolves.toEqual({ outcome: "disabled" });
  });

  it("rotates the whole encrypted pair once and rejects a stale version without mutation", async () => {
    const profile = await createProfile("8106");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: profile.id,
      accessToken: "rotation-old-access",
      refreshToken: "rotation-old-refresh",
      clientEndpoint: endpoint,
    });

    await expect(
      credentialService.rotate({
        portalInstallationId: 1,
        profileId: profile.id,
        expectedTokenVersion: 1,
        accessToken: "rotation-new-access",
        refreshToken: "rotation-new-refresh",
        clientEndpoint: endpoint,
        accessTokenExpiresAt: "2026-08-11T13:00:00.000Z",
      }),
    ).resolves.toEqual({ outcome: "rotated", tokenVersion: 2 });
    await expect(
      credentialService.resolve({ portalInstallationId: 1, profileId: profile.id }),
    ).resolves.toMatchObject({
      outcome: "active",
      accessToken: "rotation-new-access",
      refreshToken: "rotation-new-refresh",
      tokenVersion: 2,
    });

    const { data: beforeConflict } = await serviceClient
      .from("bitrix24_user_credentials")
      .select("*")
      .eq("profile_id", profile.id)
      .single();
    await expect(
      credentialService.rotate({
        portalInstallationId: 1,
        profileId: profile.id,
        expectedTokenVersion: 1,
        accessToken: "stale-access-must-not-win",
        refreshToken: "stale-refresh-must-not-win",
        clientEndpoint: endpoint,
      }),
    ).resolves.toEqual({ outcome: "version_conflict" });
    const { data: afterConflict } = await serviceClient
      .from("bitrix24_user_credentials")
      .select("*")
      .eq("profile_id", profile.id)
      .single();
    expect(afterConflict).toEqual(beforeConflict);
  });

  it("allows exactly one of sixteen concurrent rotations and stores one intact winning pair", async () => {
    const profile = await createProfile("8107");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: profile.id,
      accessToken: "concurrency-old-access",
      refreshToken: "concurrency-old-refresh",
      clientEndpoint: endpoint,
    });

    const candidates = Array.from({ length: 16 }, (_, index) => ({
      accessToken: `candidate-${index}-access`,
      refreshToken: `candidate-${index}-refresh`,
    }));
    const results = await Promise.all(
      candidates.map((candidate) =>
        credentialService.rotate({
          portalInstallationId: 1,
          profileId: profile.id,
          expectedTokenVersion: 1,
          ...candidate,
          clientEndpoint: endpoint,
        }),
      ),
    );
    expect(results.filter((result) => result.outcome === "rotated")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "version_conflict")).toHaveLength(15);

    const resolved = await credentialService.resolve({ portalInstallationId: 1, profileId: profile.id });
    expect(resolved.outcome).toBe("active");
    if (resolved.outcome !== "active") throw new Error("Expected active credentials");
    expect(resolved.tokenVersion).toBe(2);
    expect(candidates).toContainEqual({
      accessToken: resolved.accessToken,
      refreshToken: resolved.refreshToken,
    });
  });

  it("marks reauth idempotently and a stale refresh failure cannot invalidate a rotated pair", async () => {
    const reauth = await createProfile("8108");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: reauth.id,
      accessToken: "mark-access",
      refreshToken: "mark-refresh",
      clientEndpoint: endpoint,
    });
    await expect(
      credentialService.markReauthRequired({
        portalInstallationId: 1,
        profileId: reauth.id,
        expectedTokenVersion: 1,
      }),
    ).resolves.toEqual({ outcome: "marked" });
    await expect(
      credentialService.markReauthRequired({
        portalInstallationId: 1,
        profileId: reauth.id,
        expectedTokenVersion: 1,
      }),
    ).resolves.toEqual({ outcome: "already_reauth_required" });
    await expect(
      credentialService.resolve({ portalInstallationId: 1, profileId: reauth.id }),
    ).resolves.toEqual({ outcome: "reauth_required" });

    const rotated = await createProfile("8109");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: rotated.id,
      accessToken: "race-old-access",
      refreshToken: "race-old-refresh",
      clientEndpoint: endpoint,
    });
    await credentialService.rotate({
      portalInstallationId: 1,
      profileId: rotated.id,
      expectedTokenVersion: 1,
      accessToken: "race-new-access",
      refreshToken: "race-new-refresh",
      clientEndpoint: endpoint,
    });
    await expect(
      credentialService.markReauthRequired({
        portalInstallationId: 1,
        profileId: rotated.id,
        expectedTokenVersion: 1,
      }),
    ).resolves.toEqual({ outcome: "version_conflict" });
    await expect(
      credentialService.resolve({ portalInstallationId: 1, profileId: rotated.id }),
    ).resolves.toMatchObject({
      outcome: "active",
      accessToken: "race-new-access",
      refreshToken: "race-new-refresh",
      tokenVersion: 2,
    });
  });

  it("fails closed for inactive, reauth-required, and disabled rotation/state transitions", async () => {
    const inactive = await createProfile("8110");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: inactive.id,
      accessToken: "inactive-state-access",
      refreshToken: "inactive-state-refresh",
      clientEndpoint: endpoint,
    });
    await setProfileInactive(inactive.id);
    await expect(
      credentialService.rotate({
        portalInstallationId: 1,
        profileId: inactive.id,
        expectedTokenVersion: 1,
        accessToken: "no-access",
        refreshToken: "no-refresh",
        clientEndpoint: endpoint,
      }),
    ).resolves.toEqual({ outcome: "profile_inactive" });

    const reauth = await createProfile("8111");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: reauth.id,
      accessToken: "reauth-state-access",
      refreshToken: "reauth-state-refresh",
      clientEndpoint: endpoint,
    });
    await credentialService.markReauthRequired({
      portalInstallationId: 1,
      profileId: reauth.id,
      expectedTokenVersion: 1,
    });
    await expect(
      credentialService.rotate({
        portalInstallationId: 1,
        profileId: reauth.id,
        expectedTokenVersion: 1,
        accessToken: "no-access",
        refreshToken: "no-refresh",
        clientEndpoint: endpoint,
      }),
    ).resolves.toEqual({ outcome: "reauth_required" });

    const disabled = await createProfile("8112");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: disabled.id,
      accessToken: "disabled-state-access",
      refreshToken: "disabled-state-refresh",
      clientEndpoint: endpoint,
    });
    await setCredentialStatus(disabled.id, "disabled");
    await expect(
      credentialService.rotate({
        portalInstallationId: 1,
        profileId: disabled.id,
        expectedTokenVersion: 1,
        accessToken: "no-access",
        refreshToken: "no-refresh",
        clientEndpoint: endpoint,
      }),
    ).resolves.toEqual({ outcome: "disabled" });
    await expect(
      credentialService.markReauthRequired({
        portalInstallationId: 1,
        profileId: disabled.id,
        expectedTokenVersion: 1,
      }),
    ).resolves.toEqual({ outcome: "disabled" });
  });

  it("denies browser table and credential RPC access", async () => {
    const { error: tableError } = await anonClient.from("bitrix24_user_credentials").select("id");
    expect(tableError?.code).toBe("42501");
    const { error: resolveError } = await anonClient.rpc("resolve_bitrix24_user_credentials", {
      p_portal_installation_id: 1,
      p_profile_id: "218f47a7-7c60-7a31-8f6a-27f4bb596f5a",
    });
    expect(resolveError).not.toBeNull();
    const { error: reauthError } = await anonClient.rpc("mark_bitrix24_credentials_reauth_required", {
      p_portal_installation_id: 1,
      p_profile_id: "218f47a7-7c60-7a31-8f6a-27f4bb596f5a",
      p_expected_token_version: 1,
    });
    expect(reauthError).not.toBeNull();
  });
});

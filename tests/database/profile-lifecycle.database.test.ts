import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { AppSessionService, hashAppSessionToken } from "@/server/auth/app-session-service";
import { createSupabaseAppSessionRepository } from "@/server/auth/supabase-app-session-repository";
import { Bitrix24CredentialCrypto } from "@/server/credentials/bitrix24-credential-crypto";
import { Bitrix24CredentialService } from "@/server/credentials/bitrix24-credential-service";
import { createSupabaseBitrix24CredentialRepository } from "@/server/credentials/supabase-bitrix24-credential-repository";
import { createSupabaseProfileLifecycleRepository } from "@/server/profile/supabase-profile-lifecycle-repository";
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
const lifecycleRepository = createSupabaseProfileLifecycleRepository();
const sessionService = new AppSessionService(createSupabaseAppSessionRepository());
const credentialService = new Bitrix24CredentialService(
  createSupabaseBitrix24CredentialRepository(),
  new Bitrix24CredentialCrypto(Buffer.alloc(32, 0x6b)),
);
const endpoint = "https://profile-lifecycle.example/rest/";

async function createProfile(bitrixUserId: string) {
  return (
    await profileRepository.reconcileVerifiedEmployee({
      portalInstallationId: 1,
      user: { id: bitrixUserId, active: true, userType: "employee" },
    })
  ).profile;
}

async function setProfile(profileId: string, values: { role?: string; is_active?: boolean }) {
  const { error } = await serviceClient.from("profiles").update(values).eq("id", profileId);
  expect(error).toBeNull();
}

async function resetBootstrapAndAdministrators() {
  const { error: installationError } = await serviceClient
    .from("portal_installations")
    .update({ admin_bootstrapped_at: null })
    .eq("singleton_key", 1);
  expect(installationError).toBeNull();
  const { error: profilesError } = await serviceClient
    .from("profiles")
    .update({ role: "editor" })
    .eq("role", "administrator");
  expect(profilesError).toBeNull();
}

describe.sequential("administrator and profile lifecycle database security", () => {
  beforeAll(async () => {
    const { error } = await serviceClient.rpc("reconcile_portal_installation", {
      p_member_id: "a".repeat(32),
      p_portal_origin: "https://portal-a.example",
    });
    expect(error).toBeNull();
    await resetBootstrapAndAdministrators();
  });

  it("bootstraps one matching verified employee once and remains safe under concurrency", async () => {
    await resetBootstrapAndAdministrators();
    const matching = await createProfile("9201");

    await expect(
      lifecycleRepository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId: matching.id,
        verifiedBitrixUserId: matching.bitrixUserId,
      }),
    ).resolves.toMatchObject({ outcome: "promoted", role: "administrator" });
    await expect(
      lifecycleRepository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId: matching.id,
        verifiedBitrixUserId: matching.bitrixUserId,
      }),
    ).resolves.toMatchObject({ outcome: "already_administrator", role: "administrator" });

    await resetBootstrapAndAdministrators();
    const mismatched = await createProfile("9202");
    await expect(
      lifecycleRepository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId: mismatched.id,
        verifiedBitrixUserId: "9203",
      }),
    ).resolves.toMatchObject({ outcome: "identity_mismatch", role: null });
    const { data: mismatchRow } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", mismatched.id)
      .single();
    expect(mismatchRow?.role).toBe("editor");

    const existingAdministrator = await createProfile("9204");
    await setProfile(existingAdministrator.id, { role: "administrator" });
    await expect(
      lifecycleRepository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId: mismatched.id,
        verifiedBitrixUserId: mismatched.bitrixUserId,
      }),
    ).resolves.toMatchObject({ outcome: "active_administrator_exists", role: "editor" });

    await resetBootstrapAndAdministrators();
    const concurrent = await createProfile("9205");
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        lifecycleRepository.bootstrapFirstAdministrator({
          portalInstallationId: 1,
          profileId: concurrent.id,
          verifiedBitrixUserId: concurrent.bitrixUserId,
        }),
      ),
    );
    expect(results.filter((result) => result.outcome === "promoted")).toHaveLength(1);
    expect(results.every((result) => result.role === "administrator")).toBe(true);
    const { count } = await serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "administrator")
      .eq("is_active", true);
    expect(count).toBe(1);
  });

  it("authorizes roles from the application session and protects the last administrator", async () => {
    await resetBootstrapAndAdministrators();
    const administratorA = await createProfile("9210");
    const administratorB = await createProfile("9211");
    const editor = await createProfile("9212");
    const inactiveAdministrator = await createProfile("9213");
    await setProfile(administratorA.id, { role: "administrator", is_active: true });
    await setProfile(administratorB.id, { role: "administrator", is_active: true });
    await setProfile(inactiveAdministrator.id, { role: "administrator", is_active: true });

    const sessionA = await sessionService.issue({ portalInstallationId: 1, profileId: administratorA.id });
    const sessionB = await sessionService.issue({ portalInstallationId: 1, profileId: administratorB.id });
    const editorSession = await sessionService.issue({ portalInstallationId: 1, profileId: editor.id });
    const inactiveSession = await sessionService.issue({
      portalInstallationId: 1,
      profileId: inactiveAdministrator.id,
    });
    if (
      sessionA.outcome !== "created" ||
      sessionB.outcome !== "created" ||
      editorSession.outcome !== "created" ||
      inactiveSession.outcome !== "created"
    ) {
      throw new Error("Expected test sessions");
    }

    await expect(
      lifecycleRepository.changeRole({
        actorSessionTokenHash: hashAppSessionToken(editorSession.token),
        targetProfileId: administratorA.id,
        role: "editor",
      }),
    ).resolves.toEqual({ outcome: "unauthorized", role: null });
    await expect(
      lifecycleRepository.changeRole({
        actorSessionTokenHash: hashAppSessionToken(sessionA.token),
        targetProfileId: editor.id,
        role: "administrator",
      }),
    ).resolves.toEqual({ outcome: "updated", role: "administrator" });

    await setProfile(inactiveAdministrator.id, { is_active: false });
    await expect(
      lifecycleRepository.changeRole({
        actorSessionTokenHash: hashAppSessionToken(inactiveSession.token),
        targetProfileId: administratorA.id,
        role: "editor",
      }),
    ).resolves.toEqual({ outcome: "unauthorized", role: null });

    await setProfile(editor.id, { role: "editor" });
    await expect(
      lifecycleRepository.changeRole({
        actorSessionTokenHash: hashAppSessionToken(sessionA.token),
        targetProfileId: administratorB.id,
        role: "editor",
      }),
    ).resolves.toEqual({ outcome: "updated", role: "editor" });
    await expect(
      lifecycleRepository.changeRole({
        actorSessionTokenHash: hashAppSessionToken(sessionA.token),
        targetProfileId: administratorA.id,
        role: "editor",
      }),
    ).resolves.toEqual({ outcome: "last_administrator", role: "administrator" });
    await expect(
      lifecycleRepository.block({
        actorSessionTokenHash: hashAppSessionToken(sessionA.token),
        targetProfileId: administratorA.id,
      }),
    ).resolves.toMatchObject({ outcome: "last_administrator" });

    const { error: anonRoleError } = await anonClient.rpc("change_profile_role", {
      p_actor_session_token_hash: hashAppSessionToken(sessionA.token),
      p_target_profile_id: editor.id,
      p_new_role: "administrator",
    });
    const { error: anonBlockError } = await anonClient.rpc("block_profile", {
      p_actor_session_token_hash: hashAppSessionToken(sessionA.token),
      p_target_profile_id: editor.id,
    });
    expect(anonRoleError).not.toBeNull();
    expect(anonBlockError).not.toBeNull();
  });

  it("serializes conflicting last-administrator mutations so one active authority remains", async () => {
    await resetBootstrapAndAdministrators();
    const administratorA = await createProfile("9220");
    const administratorB = await createProfile("9221");
    await setProfile(administratorA.id, { role: "administrator", is_active: true });
    await setProfile(administratorB.id, { role: "administrator", is_active: true });
    const sessionA = await sessionService.issue({ portalInstallationId: 1, profileId: administratorA.id });
    const sessionB = await sessionService.issue({ portalInstallationId: 1, profileId: administratorB.id });
    if (sessionA.outcome !== "created" || sessionB.outcome !== "created") {
      throw new Error("Expected administrator sessions");
    }

    const [demoteB, blockA] = await Promise.all([
      lifecycleRepository.changeRole({
        actorSessionTokenHash: hashAppSessionToken(sessionA.token),
        targetProfileId: administratorB.id,
        role: "editor",
      }),
      lifecycleRepository.block({
        actorSessionTokenHash: hashAppSessionToken(sessionB.token),
        targetProfileId: administratorA.id,
      }),
    ]);
    expect(
      [demoteB.outcome, blockA.outcome].filter((outcome) => ["updated", "blocked"].includes(outcome)),
    ).toHaveLength(1);
    const { count } = await serviceClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "administrator")
      .eq("is_active", true)
      .eq("bitrix_active", true)
      .eq("bitrix_user_type", "employee");
    expect(count).toBe(1);
  });

  it("blocks atomically and wins races with session creation and credential rotation", async () => {
    await resetBootstrapAndAdministrators();
    const actor = await createProfile("9230");
    await setProfile(actor.id, { role: "administrator", is_active: true });
    const actorSession = await sessionService.issue({ portalInstallationId: 1, profileId: actor.id });
    if (actorSession.outcome !== "created") throw new Error("Expected administrator session");
    const actorTokenHash = hashAppSessionToken(actorSession.token);

    const target = await createProfile("9231");
    const targetSessionA = await sessionService.issue({ portalInstallationId: 1, profileId: target.id });
    const targetSessionB = await sessionService.issue({ portalInstallationId: 1, profileId: target.id });
    if (targetSessionA.outcome !== "created" || targetSessionB.outcome !== "created") {
      throw new Error("Expected target sessions");
    }
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: target.id,
      accessToken: "block-access",
      refreshToken: "block-refresh",
      clientEndpoint: endpoint,
    });
    await expect(
      lifecycleRepository.block({ actorSessionTokenHash: actorTokenHash, targetProfileId: target.id }),
    ).resolves.toEqual({ outcome: "blocked", sessionsRevoked: 2, credentialsDisabled: 1 });
    await expect(sessionService.resolve(targetSessionA.token)).resolves.toEqual({ outcome: "revoked" });
    await expect(sessionService.resolve(targetSessionB.token)).resolves.toEqual({ outcome: "revoked" });
    await expect(
      profileRepository.reconcileVerifiedEmployee({
        portalInstallationId: 1,
        user: { id: target.bitrixUserId, active: true, userType: "employee" },
      }),
    ).resolves.toMatchObject({ outcome: "inactive", profile: { isActive: false } });
    await expect(
      credentialService.replaceAfterVerifiedOAuth({
        portalInstallationId: 1,
        profileId: target.id,
        accessToken: "oauth-cannot-reactivate-access",
        refreshToken: "oauth-cannot-reactivate-refresh",
        clientEndpoint: endpoint,
      }),
    ).resolves.toEqual({ outcome: "profile_inactive" });

    const sessionRaceTarget = await createProfile("9232");
    const [blockResult, issuanceResult] = await Promise.all([
      lifecycleRepository.block({
        actorSessionTokenHash: actorTokenHash,
        targetProfileId: sessionRaceTarget.id,
      }),
      sessionService.issue({ portalInstallationId: 1, profileId: sessionRaceTarget.id }),
    ]);
    expect(blockResult.outcome).toBe("blocked");
    if (issuanceResult.outcome === "created") {
      await expect(sessionService.resolve(issuanceResult.token)).resolves.toEqual({ outcome: "revoked" });
    } else {
      expect(issuanceResult).toEqual({ outcome: "profile_inactive" });
    }

    const credentialRaceTarget = await createProfile("9233");
    await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: credentialRaceTarget.id,
      accessToken: "race-old-access",
      refreshToken: "race-old-refresh",
      clientEndpoint: endpoint,
    });
    await Promise.all([
      lifecycleRepository.block({
        actorSessionTokenHash: actorTokenHash,
        targetProfileId: credentialRaceTarget.id,
      }),
      credentialService.rotate({
        portalInstallationId: 1,
        profileId: credentialRaceTarget.id,
        expectedTokenVersion: 1,
        accessToken: "race-new-access",
        refreshToken: "race-new-refresh",
        clientEndpoint: endpoint,
      }),
    ]);
    const { data: finalProfile } = await serviceClient
      .from("profiles")
      .select("is_active")
      .eq("id", credentialRaceTarget.id)
      .single();
    const { data: finalCredential } = await serviceClient
      .from("bitrix24_user_credentials")
      .select("status")
      .eq("profile_id", credentialRaceTarget.id)
      .single();
    expect(finalProfile).toEqual({ is_active: false });
    expect(finalCredential).toEqual({ status: "disabled" });
  });
});

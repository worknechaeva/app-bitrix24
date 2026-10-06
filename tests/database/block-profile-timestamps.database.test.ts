import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { AppSessionService, hashAppSessionToken } from "@/server/auth/app-session-service";
import { createSupabaseAppSessionRepository } from "@/server/auth/supabase-app-session-repository";
import { Bitrix24CredentialCrypto } from "@/server/credentials/bitrix24-credential-crypto";
import { Bitrix24CredentialService } from "@/server/credentials/bitrix24-credential-service";
import { createSupabaseBitrix24CredentialRepository } from "@/server/credentials/supabase-bitrix24-credential-repository";
import { createSupabaseProfileLifecycleRepository } from "@/server/profile/supabase-profile-lifecycle-repository";
import { createSupabaseProfileRepository } from "@/server/profile/supabase-profile-repository";

function requiredEnvironment(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
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
const profileRepository = createSupabaseProfileRepository();
const lifecycleRepository = createSupabaseProfileLifecycleRepository();
const sessionService = new AppSessionService(createSupabaseAppSessionRepository());
const credentialService = new Bitrix24CredentialService(
  createSupabaseBitrix24CredentialRepository(),
  new Bitrix24CredentialCrypto(Buffer.alloc(32, 0x6b)),
);
const endpoint = "https://block-profile-timestamps.example/rest/";
const testRunNamespace = `8${BigInt(`0x${randomBytes(16).toString("hex")}`)
  .toString(10)
  .padStart(39, "0")}`;

function testBitrixUserId(suffix: number) {
  return `${testRunNamespace}${suffix.toString().padStart(2, "0")}`;
}

async function createProfile(bitrixUserId: string) {
  return (
    await profileRepository.reconcileVerifiedEmployee({
      portalInstallationId: 1,
      user: { id: bitrixUserId, active: true, userType: "employee" },
    })
  ).profile;
}

async function makeAdministrator() {
  const actor = await createProfile(testBitrixUserId(1));
  const { error } = await serviceClient.from("profiles").update({ role: "administrator" }).eq("id", actor.id);
  expect(error).toBeNull();

  const session = await sessionService.issue({ portalInstallationId: 1, profileId: actor.id });
  if (session.outcome !== "created") throw new Error("Expected administrator session");
  return { actor, actorTokenHash: hashAppSessionToken(session.token) };
}

describe.sequential("block_profile timestamp race regression", () => {
  beforeAll(async () => {
    const { error } = await serviceClient.rpc("reconcile_portal_installation", {
      p_member_id: "a".repeat(32),
      p_portal_origin: "https://portal-a.example",
    });
    expect(error).toBeNull();
  });

  it("writes future-created sessions and credentials with constraint-safe timestamps", async () => {
    const { actorTokenHash } = await makeAdministrator();
    const target = await createProfile(testBitrixUserId(2));
    const targetSession = await sessionService.issue({ portalInstallationId: 1, profileId: target.id });
    if (targetSession.outcome !== "created") throw new Error("Expected target session");
    const credential = await credentialService.createInitial({
      portalInstallationId: 1,
      profileId: target.id,
      accessToken: "future-created-access",
      refreshToken: "future-created-refresh",
      clientEndpoint: endpoint,
    });
    expect(credential.outcome).toBe("created");

    const futureCreatedAt = new Date(Date.now() + 60_000);
    const futureExpiresAt = new Date(futureCreatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { error: sessionError } = await serviceClient
      .from("app_sessions")
      .update({ created_at: futureCreatedAt.toISOString(), expires_at: futureExpiresAt.toISOString() })
      .eq("token_hash", hashAppSessionToken(targetSession.token));
    expect(sessionError).toBeNull();
    const { error: credentialError } = await serviceClient
      .from("bitrix24_user_credentials")
      .update({ created_at: futureCreatedAt.toISOString(), updated_at: futureCreatedAt.toISOString() })
      .eq("profile_id", target.id);
    expect(credentialError).toBeNull();

    await expect(
      lifecycleRepository.block({ actorSessionTokenHash: actorTokenHash, targetProfileId: target.id }),
    ).resolves.toEqual({ outcome: "blocked", sessionsRevoked: 1, credentialsDisabled: 1 });

    const { data: sessionRow, error: readSessionError } = await serviceClient
      .from("app_sessions")
      .select("created_at, expires_at, revoked_at")
      .eq("token_hash", hashAppSessionToken(targetSession.token))
      .single();
    expect(readSessionError).toBeNull();
    if (!sessionRow) throw new Error("Expected revoked target session");
    expect(new Date(sessionRow.revoked_at).getTime()).toBeGreaterThanOrEqual(
      new Date(sessionRow.created_at).getTime(),
    );
    expect(new Date(sessionRow.revoked_at).getTime()).toBeLessThan(new Date(sessionRow.expires_at).getTime());

    const { data: credentialRow, error: readCredentialError } = await serviceClient
      .from("bitrix24_user_credentials")
      .select("created_at, updated_at, status")
      .eq("profile_id", target.id)
      .single();
    expect(readCredentialError).toBeNull();
    if (!credentialRow) throw new Error("Expected disabled target credentials");
    expect(credentialRow.status).toBe("disabled");
    expect(new Date(credentialRow.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(credentialRow.created_at).getTime(),
    );
  });

  it("writes a future-created profile with a constraint-safe updated_at", async () => {
    const { actorTokenHash } = await makeAdministrator();
    const target = await createProfile(testBitrixUserId(3));
    const futureCreatedAt = new Date(Date.now() + 60_000).toISOString();
    const { error } = await serviceClient
      .from("profiles")
      .update({
        created_at: futureCreatedAt,
        updated_at: futureCreatedAt,
        last_identity_verified_at: futureCreatedAt,
      })
      .eq("id", target.id);
    expect(error).toBeNull();

    await expect(
      lifecycleRepository.block({ actorSessionTokenHash: actorTokenHash, targetProfileId: target.id }),
    ).resolves.toEqual({ outcome: "blocked", sessionsRevoked: 0, credentialsDisabled: 0 });

    const { data: profile, error: readError } = await serviceClient
      .from("profiles")
      .select("created_at, updated_at, last_identity_verified_at, is_active")
      .eq("id", target.id)
      .single();
    expect(readError).toBeNull();
    if (!profile) throw new Error("Expected blocked target profile");
    expect(profile.is_active).toBe(false);
    expect(new Date(profile.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(profile.created_at).getTime(),
    );
    expect(new Date(profile.last_identity_verified_at).getTime()).toBeGreaterThanOrEqual(
      new Date(profile.created_at).getTime(),
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { Bitrix24CredentialInputError } from "@/server/credentials/bitrix24-credential-repository";
import {
  Bitrix24CredentialStorageError,
  SupabaseBitrix24CredentialRepository,
} from "@/server/credentials/supabase-bitrix24-credential-repository";

const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const credentialId = "118f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const access = {
  ciphertext: Buffer.from("encrypted-access").toString("base64url"),
  iv: Buffer.alloc(12, 1).toString("base64url"),
  authTag: Buffer.alloc(16, 2).toString("base64url"),
};
const refresh = {
  ciphertext: Buffer.from("encrypted-refresh").toString("base64url"),
  iv: Buffer.alloc(12, 3).toString("base64url"),
  authTag: Buffer.alloc(16, 4).toString("base64url"),
};
const input = {
  portalInstallationId: 1 as const,
  profileId,
  encryptedAccessToken: access,
  encryptedRefreshToken: refresh,
  encryptionVersion: 1 as const,
  clientEndpoint: "https://portal.example/rest/",
  accessTokenExpiresAt: null,
};
const activeRow = {
  outcome: "active",
  credential_id: credentialId,
  portal_installation_id: 1,
  profile_id: profileId,
  access_token_ciphertext: access.ciphertext,
  access_token_iv: access.iv,
  access_token_auth_tag: access.authTag,
  refresh_token_ciphertext: refresh.ciphertext,
  refresh_token_iv: refresh.iv,
  refresh_token_auth_tag: refresh.authTag,
  encryption_version: 1,
  token_version: 1,
  client_endpoint: input.clientEndpoint,
  access_token_expires_at: null,
  created_at: "2026-08-10T12:00:00.000Z",
  updated_at: "2026-08-10T12:00:00.000Z",
};

function inactiveRow(outcome: "unknown" | "profile_inactive" | "reauth_required" | "disabled") {
  return {
    outcome,
    credential_id: null,
    portal_installation_id: null,
    profile_id: null,
    access_token_ciphertext: null,
    access_token_iv: null,
    access_token_auth_tag: null,
    refresh_token_ciphertext: null,
    refresh_token_iv: null,
    refresh_token_auth_tag: null,
    encryption_version: null,
    token_version: null,
    client_endpoint: null,
    access_token_expires_at: null,
    created_at: null,
    updated_at: null,
  };
}

describe("Supabase Bitrix24 credential repository", () => {
  it("maps safe version-only verified OAuth context and never accepts encrypted payload from inspection", async () => {
    const inspect = vi.fn().mockResolvedValue({
      data: [{ outcome: "replaceable", current_token_version: 4, next_token_version: 5 }],
      error: null,
    });
    const repository = new SupabaseBitrix24CredentialRepository(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      inspect,
      vi.fn(),
    );
    await expect(repository.inspectForVerifiedOAuth({ portalInstallationId: 1, profileId })).resolves.toEqual(
      {
        outcome: "replaceable",
        currentTokenVersion: 4,
        nextTokenVersion: 5,
      },
    );
    expect(inspect).toHaveBeenCalledExactlyOnceWith({ p_portal_installation_id: 1, p_profile_id: profileId });
  });

  it("sends one complete encrypted pair to the narrow verified OAuth replacement RPC", async () => {
    const replace = vi.fn().mockResolvedValue({
      data: [{ outcome: "replaced", token_version: 2 }],
      error: null,
    });
    const repository = new SupabaseBitrix24CredentialRepository(
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      replace,
    );
    await expect(
      repository.replaceAfterVerifiedOAuth({
        ...input,
        expectedCurrentTokenVersion: 1,
        newTokenVersion: 2,
      }),
    ).resolves.toEqual({ outcome: "replaced", tokenVersion: 2 });
    expect(replace).toHaveBeenCalledWith({
      p_portal_installation_id: 1,
      p_profile_id: profileId,
      p_expected_current_token_version: 1,
      p_new_token_version: 2,
      p_access_token_ciphertext: access.ciphertext,
      p_access_token_iv: access.iv,
      p_access_token_auth_tag: access.authTag,
      p_refresh_token_ciphertext: refresh.ciphertext,
      p_refresh_token_iv: refresh.iv,
      p_refresh_token_auth_tag: refresh.authTag,
      p_encryption_version: 1,
      p_client_endpoint: input.clientEndpoint,
      p_access_token_expires_at: null,
    });
  });

  it("creates only through the narrow encrypted RPC and maps the returned row", async () => {
    const create = vi.fn().mockResolvedValue({ data: [{ ...activeRow, outcome: "created" }], error: null });
    const repository = new SupabaseBitrix24CredentialRepository(create, vi.fn(), vi.fn(), vi.fn());

    await expect(repository.createInitial(input)).resolves.toMatchObject({
      outcome: "created",
      credential: {
        id: credentialId,
        profileId,
        tokenVersion: 1,
        encryptedAccessToken: access,
        encryptedRefreshToken: refresh,
      },
    });
    expect(create).toHaveBeenCalledExactlyOnceWith({
      p_portal_installation_id: 1,
      p_profile_id: profileId,
      p_access_token_ciphertext: access.ciphertext,
      p_access_token_iv: access.iv,
      p_access_token_auth_tag: access.authTag,
      p_refresh_token_ciphertext: refresh.ciphertext,
      p_refresh_token_iv: refresh.iv,
      p_refresh_token_auth_tag: refresh.authTag,
      p_encryption_version: 1,
      p_client_endpoint: input.clientEndpoint,
      p_access_token_expires_at: null,
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain("plaintext");
  });

  it.each(["unknown", "profile_inactive", "reauth_required", "disabled"] as const)(
    "maps safe %s resolution without encrypted fields",
    async (outcome) => {
      const resolve = vi.fn().mockResolvedValue({ data: [inactiveRow(outcome)], error: null });
      const repository = new SupabaseBitrix24CredentialRepository(vi.fn(), resolve, vi.fn(), vi.fn());

      await expect(repository.resolve({ portalInstallationId: 1, profileId })).resolves.toEqual({ outcome });
    },
  );

  it("maps active resolution and validates identity, endpoint, IVs, and envelopes", async () => {
    const resolve = vi.fn().mockResolvedValue({ data: [activeRow], error: null });
    const repository = new SupabaseBitrix24CredentialRepository(vi.fn(), resolve, vi.fn(), vi.fn());

    await expect(repository.resolve({ portalInstallationId: 1, profileId })).resolves.toMatchObject({
      outcome: "active",
      credential: { id: credentialId, profileId, clientEndpoint: input.clientEndpoint },
    });
  });

  it.each([
    ["rotated", 2, { outcome: "rotated", tokenVersion: 2 }],
    ["version_conflict", null, { outcome: "version_conflict" }],
    ["profile_inactive", null, { outcome: "profile_inactive" }],
    ["reauth_required", null, { outcome: "reauth_required" }],
    ["disabled", null, { outcome: "disabled" }],
    ["unknown", null, { outcome: "unknown" }],
  ] as const)("maps %s rotation", async (outcome, tokenVersion, expected) => {
    const rotate = vi
      .fn()
      .mockResolvedValue({ data: [{ outcome, token_version: tokenVersion }], error: null });
    const repository = new SupabaseBitrix24CredentialRepository(vi.fn(), vi.fn(), rotate, vi.fn());

    await expect(repository.rotate({ ...input, expectedTokenVersion: 1 })).resolves.toEqual(expected);
  });

  it.each([
    "marked",
    "already_reauth_required",
    "unknown",
    "profile_inactive",
    "disabled",
    "version_conflict",
  ] as const)("maps %s reauth transition", async (outcome) => {
    const mark = vi.fn().mockResolvedValue({ data: [{ outcome }], error: null });
    const repository = new SupabaseBitrix24CredentialRepository(vi.fn(), vi.fn(), vi.fn(), mark);

    await expect(
      repository.markReauthRequired({ portalInstallationId: 1, profileId, expectedTokenVersion: 1 }),
    ).resolves.toEqual({ outcome });
  });

  it.each([
    { ...input, profileId: "not-a-uuid" },
    { ...input, portalInstallationId: 2 },
    { ...input, encryptedRefreshToken: { ...refresh, iv: access.iv } },
    { ...input, clientEndpoint: "http://portal.example/rest/" },
    { ...input, encryptedAccessToken: { ...access, ciphertext: "not=base64url" } },
  ])("rejects invalid encrypted input before transport", async (invalidInput) => {
    const create = vi.fn();
    const repository = new SupabaseBitrix24CredentialRepository(create, vi.fn(), vi.fn(), vi.fn());

    await expect(repository.createInitial(invalidInput)).rejects.toBeInstanceOf(Bitrix24CredentialInputError);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    () => Promise.reject(new Error("ciphertext-and-raw-storage-error")),
    () => Promise.resolve({ data: null, error: { message: "sensitive SQL detail" } }),
    () => Promise.resolve({ data: [{ ...activeRow, access_token_iv: refresh.iv }], error: null }),
    () => Promise.resolve({ data: [inactiveRow("disabled"), inactiveRow("disabled")], error: null }),
  ])("normalizes transport and malformed response failures", async (resolve) => {
    const repository = new SupabaseBitrix24CredentialRepository(vi.fn(), resolve, vi.fn(), vi.fn());

    let thrown: unknown;
    try {
      await repository.resolve({ portalInstallationId: 1, profileId });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Bitrix24CredentialStorageError);
    expect(String(thrown)).not.toContain("ciphertext");
    expect(String(thrown)).not.toContain("SQL detail");
  });
});

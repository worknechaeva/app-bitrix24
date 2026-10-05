import { describe, expect, it, vi } from "vitest";
import { ProfileLifecycleInputError } from "@/server/profile/profile-lifecycle-repository";
import {
  ProfileLifecycleStorageError,
  type ProfileLifecycleStorageOperation,
  SupabaseProfileLifecycleRepository,
} from "@/server/profile/supabase-profile-lifecycle-repository";

const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const tokenHash = "a".repeat(64);

function createRepository(
  overrides: {
    bootstrap?: unknown;
    bootstrapError?: unknown;
    role?: unknown;
    roleError?: unknown;
    block?: unknown;
    blockError?: unknown;
  } = {},
): SupabaseProfileLifecycleRepository {
  return new SupabaseProfileLifecycleRepository(
    vi.fn(async () => ({
      data: overrides.bootstrap ?? [
        {
          outcome: "promoted",
          role: "administrator",
          admin_bootstrapped_at: "2026-08-12T12:00:00.000Z",
        },
      ],
      error: overrides.bootstrapError ?? null,
    })),
    vi.fn(async () => ({
      data: overrides.role ?? [{ outcome: "updated", role: "administrator" }],
      error: overrides.roleError ?? null,
    })),
    vi.fn(async () => ({
      data: overrides.block ?? [{ outcome: "blocked", sessions_revoked: 3, credentials_disabled: 1 }],
      error: overrides.blockError ?? null,
    })),
  );
}

function createTransportFailureRepository(
  operation: ProfileLifecycleStorageOperation,
  failure: unknown,
): SupabaseProfileLifecycleRepository {
  const reject = async () => {
    throw failure;
  };
  const bootstrap =
    operation === "bootstrap"
      ? reject
      : async () => ({
          data: [
            {
              outcome: "promoted",
              role: "administrator",
              admin_bootstrapped_at: "2026-08-12T12:00:00.000Z",
            },
          ],
          error: null,
        });
  const role =
    operation === "change_role"
      ? reject
      : async () => ({ data: [{ outcome: "updated", role: "administrator" }], error: null });
  const block =
    operation === "block"
      ? reject
      : async () => ({
          data: [{ outcome: "blocked", sessions_revoked: 1, credentials_disabled: 1 }],
          error: null,
        });
  return new SupabaseProfileLifecycleRepository(bootstrap, role, block);
}

async function captureStorageError(promise: Promise<unknown>): Promise<ProfileLifecycleStorageError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ProfileLifecycleStorageError);
    return error as ProfileLifecycleStorageError;
  }
  throw new Error("Expected ProfileLifecycleStorageError");
}

function invokeOperation(
  repository: SupabaseProfileLifecycleRepository,
  operation: ProfileLifecycleStorageOperation,
) {
  if (operation === "bootstrap") {
    return repository.bootstrapFirstAdministrator({
      portalInstallationId: 1,
      profileId,
      verifiedBitrixUserId: "42",
    });
  }
  if (operation === "change_role") {
    return repository.changeRole({
      actorSessionTokenHash: tokenHash,
      targetProfileId: profileId,
      role: "administrator",
    });
  }
  return repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: profileId });
}

describe("Supabase profile lifecycle repository", () => {
  it("maps narrow bootstrap, role, and block RPC outcomes", async () => {
    const repository = createRepository();
    await expect(
      repository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId,
        verifiedBitrixUserId: "42",
      }),
    ).resolves.toEqual({
      outcome: "promoted",
      role: "administrator",
      adminBootstrappedAt: "2026-08-12T12:00:00.000Z",
    });
    await expect(
      repository.changeRole({
        actorSessionTokenHash: tokenHash,
        targetProfileId: profileId,
        role: "administrator",
      }),
    ).resolves.toEqual({ outcome: "updated", role: "administrator" });
    await expect(
      repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: profileId }),
    ).resolves.toEqual({ outcome: "blocked", sessionsRevoked: 3, credentialsDisabled: 1 });
  });

  it("rejects invalid identities and token hashes before database transport", async () => {
    const bootstrap = vi.fn();
    const role = vi.fn();
    const block = vi.fn();
    const repository = new SupabaseProfileLifecycleRepository(bootstrap, role, block);

    await expect(
      repository.bootstrapFirstAdministrator({
        portalInstallationId: 2,
        profileId,
        verifiedBitrixUserId: "42",
      }),
    ).rejects.toBeInstanceOf(ProfileLifecycleInputError);
    await expect(
      repository.changeRole({
        actorSessionTokenHash: "raw-token",
        targetProfileId: profileId,
        role: "editor",
      }),
    ).rejects.toBeInstanceOf(ProfileLifecycleInputError);
    await expect(
      repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: "not-a-uuid" }),
    ).rejects.toBeInstanceOf(ProfileLifecycleInputError);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(role).not.toHaveBeenCalled();
    expect(block).not.toHaveBeenCalled();
  });

  it("normalizes malformed database responses without exposing details", async () => {
    const repository = createRepository({
      bootstrap: [{ outcome: "promoted", role: null, admin_bootstrapped_at: null }],
      role: [{ outcome: "updated", role: null }],
      block: [{ outcome: "blocked", sessions_revoked: -1, credentials_disabled: 0 }],
    });
    const calls = [
      repository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId,
        verifiedBitrixUserId: "42",
      }),
      repository.changeRole({ actorSessionTokenHash: tokenHash, targetProfileId: profileId, role: "editor" }),
      repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: profileId }),
    ];
    for (const call of calls) await expect(call).rejects.toBeInstanceOf(ProfileLifecycleStorageError);
  });

  it("classifies a malformed response envelope as unknown", async () => {
    const repository = new SupabaseProfileLifecycleRepository(
      vi.fn(async () => null) as never,
      vi.fn(),
      vi.fn(),
    );

    const error = await captureStorageError(
      repository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId,
        verifiedBitrixUserId: "42",
      }),
    );

    expect(error.diagnostic).toEqual({ operation: "bootstrap", category: "unknown" });
  });

  it.each([
    ["bootstrap", "PGRST001"],
    ["change_role", "PGRST002"],
  ] as const)("classifies %s response errors with canonical PGRST code %s", async (operation, code) => {
    const repository = createRepository({
      ...(operation === "bootstrap" ? { bootstrapError: { code } } : { roleError: { code } }),
    });

    const error = await captureStorageError(invokeOperation(repository, operation));

    expect(error).toMatchObject({
      name: "ProfileLifecycleStorageError",
      code: "profile_lifecycle_storage_failure",
      message: "Profile lifecycle storage failure",
      diagnostic: { operation, category: "pgrst", code },
    });
  });

  it("classifies a canonical SQLSTATE response error", async () => {
    const repository = createRepository({ blockError: { code: "40P01" } });

    const error = await captureStorageError(
      repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: profileId }),
    );

    expect(error.diagnostic).toEqual({ operation: "block", category: "sqlstate", code: "40P01" });
  });

  it.each(["ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"] as const)(
    "classifies the code-only transport exception %s as a connection failure",
    async (code) => {
      const repository = createTransportFailureRepository("block", { code });

      const error = await captureStorageError(
        repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: profileId }),
      );

      expect(error.diagnostic).toEqual({ operation: "block", category: "connection", code });
    },
  );

  it.each(["ECONNRESET_EXTRA", "PREFIX_EHOSTUNREACH", "ENETUNREACH_EXTRA"])(
    "does not classify the non-exact connection code %s",
    async (code) => {
      const error = await captureStorageError(
        invokeOperation(createTransportFailureRepository("block", { code }), "block"),
      );

      expect(error.diagnostic).toEqual({ operation: "block", category: "unknown" });
    },
  );

  it.each([
    [{ name: "TimeoutError" }, { operation: "bootstrap", category: "timeout" }],
    [
      { code: "UND_ERR_CONNECT_TIMEOUT" },
      { operation: "bootstrap", category: "timeout", code: "UND_ERR_CONNECT_TIMEOUT" },
    ],
  ] as const)("classifies allowlisted timeout transport exceptions", async (failure, diagnostic) => {
    const repository = createTransportFailureRepository("bootstrap", failure);

    const error = await captureStorageError(
      repository.bootstrapFirstAdministrator({
        portalInstallationId: 1,
        profileId,
        verifiedBitrixUserId: "42",
      }),
    );

    expect(error.diagnostic).toEqual(diagnostic);
  });

  it("uses an allowlisted nested cause without retaining sensitive source fields", async () => {
    const secretMarker = "secret-access-token-marker";
    const personalMarker = "personal-user-marker";
    const repository = createTransportFailureRepository("change_role", {
      name: "OuterTransportError",
      message: secretMarker,
      details: personalMarker,
      hint: secretMarker,
      payload: { personalMarker },
      cause: {
        code: "EHOSTUNREACH",
        message: `${secretMarker}:${personalMarker}`,
      },
    });

    const error = await captureStorageError(
      repository.changeRole({
        actorSessionTokenHash: tokenHash,
        targetProfileId: profileId,
        role: "editor",
      }),
    );
    const serialized = JSON.stringify(error);

    expect(error.cause).toBeUndefined();
    expect(error.message).toBe("Profile lifecycle storage failure");
    expect(error.diagnostic).toEqual({
      operation: "change_role",
      category: "connection",
      code: "EHOSTUNREACH",
    });
    expect(serialized).not.toContain(secretMarker);
    expect(serialized).not.toContain(personalMarker);
    expect(JSON.stringify(error.diagnostic)).not.toContain(secretMarker);
    expect(JSON.stringify(error.diagnostic)).not.toContain(personalMarker);
  });

  it("returns unknown for invalid codes and does not copy error metadata", async () => {
    const secretMarker = "secret-in-invalid-code";
    const personalMarker = "personal-in-provider-message";
    const repository = createRepository({
      blockError: {
        code: `PGRST01-${secretMarker}`,
        name: "ProviderFailure",
        message: personalMarker,
        details: secretMarker,
        hint: personalMarker,
        payload: { secretMarker },
      },
    });

    const error = await captureStorageError(
      repository.block({ actorSessionTokenHash: tokenHash, targetProfileId: profileId }),
    );
    const serialized = JSON.stringify(error);

    expect(error.diagnostic).toEqual({ operation: "block", category: "unknown" });
    expect(serialized).not.toContain(secretMarker);
    expect(serialized).not.toContain(personalMarker);
  });

  it("bounds cause traversal and stops on cycles", async () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    const tooDeep = {
      cause: { cause: { cause: { cause: { code: "PGRST001" } } } },
    };

    const cyclicError = await captureStorageError(
      invokeOperation(createTransportFailureRepository("block", cyclic), "block"),
    );
    const deepError = await captureStorageError(
      invokeOperation(createTransportFailureRepository("block", tooDeep), "block"),
    );

    expect(cyclicError.diagnostic).toEqual({ operation: "block", category: "unknown" });
    expect(deepError.diagnostic).toEqual({ operation: "block", category: "unknown" });
  });
});

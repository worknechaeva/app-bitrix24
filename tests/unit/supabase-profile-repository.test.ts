import { describe, expect, it, vi } from "vitest";
import { ProfileIdentityError } from "@/server/profile/profile-repository";
import { ProfileStorageError, SupabaseProfileRepository } from "@/server/profile/supabase-profile-repository";

const profileId = "018f47a7-7c60-7a31-8f6a-27f4bb596f5a";
const timestamp = "2026-08-05T21:00:00.000Z";
const identity = {
  portalInstallationId: 1,
  user: { id: "42", active: true, userType: "employee" },
} as const;

function rpcRow(
  outcome: "created" | "unchanged" | "snapshot_updated" | "inactive",
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    outcome,
    id: profileId,
    portal_installation_id: 1,
    bitrix_user_id: "42",
    role: "editor",
    is_active: outcome !== "inactive",
    bitrix_active: true,
    bitrix_user_type: "employee",
    last_identity_verified_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

describe("Supabase profile repository", () => {
  it.each(["created", "unchanged", "snapshot_updated", "inactive"] as const)(
    "maps the %s RPC result",
    async (outcome) => {
      const transport = vi.fn().mockResolvedValue({ data: [rpcRow(outcome)], error: null });
      const repository = new SupabaseProfileRepository(transport);

      await expect(repository.reconcileVerifiedEmployee(identity)).resolves.toEqual({
        outcome,
        profile: {
          id: profileId,
          portalInstallationId: 1,
          bitrixUserId: "42",
          role: "editor",
          isActive: outcome !== "inactive",
          identitySnapshot: { active: true, userType: "employee", verifiedAt: timestamp },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      expect(transport).toHaveBeenCalledWith({
        p_portal_installation_id: 1,
        p_bitrix_user_id: "42",
        p_bitrix_active: true,
        p_bitrix_user_type: "employee",
      });
    },
  );

  it.each([
    { ...identity, portalInstallationId: 2 },
    { ...identity, user: { ...identity.user, id: "invalid" } },
    { ...identity, user: { ...identity.user, active: false } },
    { ...identity, user: { ...identity.user, userType: "extranet" } },
    { ...identity, role: "administrator" },
    { ...identity, isActive: false },
  ])("rejects invalid or privileged input before database transport", async (input) => {
    const transport = vi.fn();
    const repository = new SupabaseProfileRepository(transport);

    await expect(repository.reconcileVerifiedEmployee(input as never)).rejects.toBeInstanceOf(
      ProfileIdentityError,
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    () => Promise.reject(new Error("service role key leaked here")),
    () => Promise.resolve({ data: null, error: { message: "internal SQL error" } }),
    () => Promise.resolve({ data: [], error: null }),
    () => Promise.resolve({ data: [rpcRow("created", { outcome: "unexpected" })], error: null }),
    () => Promise.resolve({ data: [rpcRow("created", { role: "administrator" })], error: null }),
    () => Promise.resolve({ data: [rpcRow("inactive", { is_active: true })], error: null }),
  ])("fails closed with one safe storage error", async (transport) => {
    const repository = new SupabaseProfileRepository(transport);

    let thrown: unknown;
    try {
      await repository.reconcileVerifiedEmployee(identity);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining<Partial<ProfileStorageError>>({
        code: "profile_storage_failure",
        message: "Profile storage failure",
      }),
    );
    expect(String(thrown)).not.toContain("service role key");
    expect(String(thrown)).not.toContain("internal SQL");
  });
});

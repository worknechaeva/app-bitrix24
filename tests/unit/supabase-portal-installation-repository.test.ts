import { describe, expect, it, vi } from "vitest";
import { PortalInstallationIdentityError } from "@/server/portal/portal-installation-repository";
import {
  PortalInstallationStorageError,
  SupabasePortalInstallationRepository,
} from "@/server/portal/supabase-portal-installation-repository";

const memberId = "a".repeat(32);
const timestamp = "2026-08-05T18:00:00.000Z";

function rpcRow(
  outcome: "created" | "unchanged" | "origin_updated" | "mismatch",
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    outcome,
    member_id: memberId,
    portal_origin: "https://portal.example",
    previous_portal_origin: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...overrides,
  };
}

describe("Supabase portal installation repository", () => {
  it.each(["created", "unchanged"] as const)("maps the %s RPC result", async (outcome) => {
    const transport = vi.fn().mockResolvedValue({ data: [rpcRow(outcome)], error: null });
    const repository = new SupabasePortalInstallationRepository(transport);

    await expect(
      repository.reconcileTrustedIdentity({ memberId, portalOrigin: "https://PORTAL.EXAMPLE" }),
    ).resolves.toEqual({
      outcome,
      installation: { memberId, portalOrigin: "https://portal.example" },
    });
    expect(transport).toHaveBeenCalledWith({
      p_member_id: memberId,
      p_portal_origin: "https://portal.example",
    });
  });

  it("maps an origin update including the previous canonical origin", async () => {
    const repository = new SupabasePortalInstallationRepository(
      vi.fn().mockResolvedValue({
        data: [
          rpcRow("origin_updated", {
            portal_origin: "https://new.example",
            previous_portal_origin: "https://old.example",
          }),
        ],
        error: null,
      }),
    );

    await expect(
      repository.reconcileTrustedIdentity({ memberId, portalOrigin: "https://new.example" }),
    ).resolves.toEqual({
      outcome: "origin_updated",
      installation: { memberId, portalOrigin: "https://new.example" },
      previousPortalOrigin: "https://old.example",
    });
  });

  it("rejects a different member ID with the existing domain error", async () => {
    const repository = new SupabasePortalInstallationRepository(
      vi.fn().mockResolvedValue({ data: [rpcRow("mismatch")], error: null }),
    );

    await expect(
      repository.reconcileTrustedIdentity({
        memberId: "b".repeat(32),
        portalOrigin: "https://other.example",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PortalInstallationIdentityError>>({
        code: "portal_installation_mismatch",
      }),
    );
  });

  it("rejects invalid identity before the transport is called", async () => {
    const transport = vi.fn();
    const repository = new SupabasePortalInstallationRepository(transport);

    await expect(
      repository.reconcileTrustedIdentity({ memberId: "invalid", portalOrigin: "http://unsafe.example" }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PortalInstallationIdentityError>>({
        code: "invalid_portal_identity",
      }),
    );
    expect(transport).not.toHaveBeenCalled();
  });

  it.each([
    () => Promise.reject(new Error("database password leaked here")),
    () => Promise.resolve({ data: null, error: { message: "internal database error" } }),
    () => Promise.resolve({ data: [], error: null }),
    () => Promise.resolve({ data: [rpcRow("created", { member_id: "b".repeat(32) })], error: null }),
  ])("converts transport and payload failures to one safe storage error", async (transport) => {
    const repository = new SupabasePortalInstallationRepository(transport);

    let thrown: unknown;
    try {
      await repository.reconcileTrustedIdentity({ memberId, portalOrigin: "https://portal.example" });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toEqual(
      expect.objectContaining<Partial<PortalInstallationStorageError>>({
        code: "portal_installation_storage_failure",
        message: "Portal installation storage failure",
      }),
    );
    expect(String(thrown)).not.toContain("database password");
    expect(String(thrown)).not.toContain("internal database error");
  });
});

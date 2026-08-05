import { describe, expect, it } from "vitest";
import {
  PortalInstallationIdentityError,
  reconcilePortalInstallationIdentity,
} from "@/server/portal/portal-installation-repository";

const memberId = "a".repeat(32);

describe("portal installation identity reconciliation", () => {
  it("creates the first installation from a trusted identity", () => {
    expect(
      reconcilePortalInstallationIdentity(null, {
        memberId,
        portalOrigin: "https://portal.example",
      }),
    ).toEqual({
      outcome: "created",
      installation: {
        memberId,
        portalOrigin: "https://portal.example",
      },
    });
  });

  it("keeps a matching installation unchanged", () => {
    const identity = { memberId, portalOrigin: "https://portal.example" };

    expect(reconcilePortalInstallationIdentity(identity, identity)).toEqual({
      outcome: "unchanged",
      installation: identity,
    });
  });

  it("allows only the canonical origin to change for the same member", () => {
    expect(
      reconcilePortalInstallationIdentity(
        { memberId, portalOrigin: "https://old.example" },
        { memberId, portalOrigin: "https://new.example" },
      ),
    ).toEqual({
      outcome: "origin_updated",
      installation: { memberId, portalOrigin: "https://new.example" },
      previousPortalOrigin: "https://old.example",
    });
  });

  it("rejects another portal instead of replacing the singleton installation", () => {
    expect(() =>
      reconcilePortalInstallationIdentity(
        { memberId, portalOrigin: "https://portal.example" },
        { memberId: "b".repeat(32), portalOrigin: "https://other.example" },
      ),
    ).toThrowError(
      expect.objectContaining<Partial<PortalInstallationIdentityError>>({
        code: "portal_installation_mismatch",
      }),
    );
  });

  it.each([
    { memberId: "invalid", portalOrigin: "https://portal.example" },
    { memberId, portalOrigin: "http://portal.example" },
    { memberId, portalOrigin: "https://portal.example/rest/" },
    { memberId, portalOrigin: "https://portal.example?token=secret" },
  ])("rejects malformed identities before persistence", (identity) => {
    expect(() => reconcilePortalInstallationIdentity(null, identity)).toThrowError(
      expect.objectContaining<Partial<PortalInstallationIdentityError>>({
        code: "invalid_portal_identity",
      }),
    );
  });
});

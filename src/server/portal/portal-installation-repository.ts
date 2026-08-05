import "server-only";

import { canonicalPortalOriginFromConfiguredOrigin } from "@/integrations/bitrix24/portal-origin";

const memberIdPattern = /^[a-f0-9]{32}$/i;

export type PortalInstallationIdentity = {
  memberId: string;
  portalOrigin: string;
};

export type PortalInstallationReconciliation =
  | {
      outcome: "created" | "unchanged";
      installation: PortalInstallationIdentity;
    }
  | {
      outcome: "origin_updated";
      installation: PortalInstallationIdentity;
      previousPortalOrigin: string;
    };

export class PortalInstallationIdentityError extends Error {
  readonly code: "invalid_portal_identity" | "portal_installation_mismatch";

  constructor(code: PortalInstallationIdentityError["code"]) {
    super(
      code === "portal_installation_mismatch" ? "Portal installation mismatch" : "Invalid portal identity",
    );
    this.name = "PortalInstallationIdentityError";
    this.code = code;
  }
}

export function validatePortalInstallationIdentity(
  identity: PortalInstallationIdentity,
): PortalInstallationIdentity {
  if (!memberIdPattern.test(identity.memberId)) {
    throw new PortalInstallationIdentityError("invalid_portal_identity");
  }

  try {
    return {
      memberId: identity.memberId,
      portalOrigin: canonicalPortalOriginFromConfiguredOrigin(identity.portalOrigin),
    };
  } catch {
    throw new PortalInstallationIdentityError("invalid_portal_identity");
  }
}

/**
 * Defines the storage-independent single-portal transition. A future database
 * adapter must apply the equivalent transition atomically.
 */
export function reconcilePortalInstallationIdentity(
  current: PortalInstallationIdentity | null,
  trusted: PortalInstallationIdentity,
): PortalInstallationReconciliation {
  const trustedIdentity = validatePortalInstallationIdentity(trusted);

  if (current === null) {
    return { outcome: "created", installation: trustedIdentity };
  }

  const currentIdentity = validatePortalInstallationIdentity(current);
  if (currentIdentity.memberId !== trustedIdentity.memberId) {
    throw new PortalInstallationIdentityError("portal_installation_mismatch");
  }

  if (currentIdentity.portalOrigin === trustedIdentity.portalOrigin) {
    return { outcome: "unchanged", installation: currentIdentity };
  }

  return {
    outcome: "origin_updated",
    installation: trustedIdentity,
    previousPortalOrigin: currentIdentity.portalOrigin,
  };
}

export interface PortalInstallationRepository {
  /**
   * Creates the singleton installation, keeps it unchanged, or updates only
   * its canonical origin after the caller has verified the OAuth identity.
   * Implementations must perform this operation atomically and reject a
   * different member_id.
   */
  reconcileTrustedIdentity(identity: PortalInstallationIdentity): Promise<PortalInstallationReconciliation>;
}

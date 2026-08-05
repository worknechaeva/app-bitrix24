import "server-only";

import { z } from "zod";
import {
  reconcilePortalInstallationRpc,
  type PortalInstallationRpcTransport,
} from "@/server/database/supabase-privileged-gateway";
import {
  PortalInstallationIdentityError,
  type PortalInstallationIdentity,
  type PortalInstallationReconciliation,
  type PortalInstallationRepository,
  validatePortalInstallationIdentity,
} from "./portal-installation-repository";

const rpcResultSchema = z
  .array(
    z.object({
      outcome: z.enum(["created", "unchanged", "origin_updated", "mismatch"]),
      member_id: z.string(),
      portal_origin: z.string(),
      previous_portal_origin: z.string().nullable(),
      created_at: z.iso.datetime({ offset: true }),
      updated_at: z.iso.datetime({ offset: true }),
    }),
  )
  .length(1);

export class PortalInstallationStorageError extends Error {
  readonly code = "portal_installation_storage_failure";

  constructor() {
    super("Portal installation storage failure");
    this.name = "PortalInstallationStorageError";
  }
}

export class SupabasePortalInstallationRepository implements PortalInstallationRepository {
  constructor(private readonly callReconciliationRpc: PortalInstallationRpcTransport) {}

  async reconcileTrustedIdentity(
    identity: PortalInstallationIdentity,
  ): Promise<PortalInstallationReconciliation> {
    const trustedIdentity = validatePortalInstallationIdentity(identity);

    let response;
    try {
      response = await this.callReconciliationRpc({
        p_member_id: trustedIdentity.memberId,
        p_portal_origin: trustedIdentity.portalOrigin,
      });
    } catch {
      throw new PortalInstallationStorageError();
    }

    if (response.error !== null) throw new PortalInstallationStorageError();

    const parsed = rpcResultSchema.safeParse(response.data);
    if (!parsed.success) throw new PortalInstallationStorageError();

    const row = parsed.data[0];
    if (row.outcome === "mismatch") {
      throw new PortalInstallationIdentityError("portal_installation_mismatch");
    }

    let installation: PortalInstallationIdentity;
    try {
      installation = validatePortalInstallationIdentity({
        memberId: row.member_id,
        portalOrigin: row.portal_origin,
      });
    } catch {
      throw new PortalInstallationStorageError();
    }

    if (
      installation.memberId !== trustedIdentity.memberId ||
      installation.portalOrigin !== trustedIdentity.portalOrigin
    ) {
      throw new PortalInstallationStorageError();
    }

    if (row.outcome === "origin_updated") {
      if (row.previous_portal_origin === null) throw new PortalInstallationStorageError();

      let previousPortalOrigin: string;
      try {
        previousPortalOrigin = validatePortalInstallationIdentity({
          memberId: installation.memberId,
          portalOrigin: row.previous_portal_origin,
        }).portalOrigin;
      } catch {
        throw new PortalInstallationStorageError();
      }

      return {
        outcome: "origin_updated",
        installation,
        previousPortalOrigin,
      };
    }

    if (row.previous_portal_origin !== null) throw new PortalInstallationStorageError();

    return { outcome: row.outcome, installation };
  }
}

export function createSupabasePortalInstallationRepository(): PortalInstallationRepository {
  return new SupabasePortalInstallationRepository(reconcilePortalInstallationRpc);
}

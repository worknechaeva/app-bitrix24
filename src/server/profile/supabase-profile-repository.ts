import "server-only";

import { z } from "zod";
import { reconcileProfileRpc, type ProfileRpcTransport } from "@/server/database/supabase-privileged-gateway";
import {
  type Profile,
  type ProfileReconciliation,
  type ProfileRepository,
  type VerifiedEmployeeProfileIdentity,
  validateVerifiedEmployeeProfileIdentity,
} from "./profile-repository";

const rpcResultSchema = z
  .array(
    z
      .object({
        outcome: z.enum(["created", "unchanged", "snapshot_updated", "inactive"]),
        id: z.uuid(),
        portal_installation_id: z.literal(1),
        bitrix_user_id: z.string().regex(/^[1-9][0-9]{0,63}$/),
        role: z.enum(["editor", "administrator"]),
        is_active: z.boolean(),
        bitrix_active: z.boolean(),
        bitrix_user_type: z.string().min(1).max(64),
        last_identity_verified_at: z.iso.datetime({ offset: true }),
        created_at: z.iso.datetime({ offset: true }),
        updated_at: z.iso.datetime({ offset: true }),
      })
      .strict(),
  )
  .length(1);

export class ProfileStorageError extends Error {
  readonly code = "profile_storage_failure";

  constructor() {
    super("Profile storage failure");
    this.name = "ProfileStorageError";
  }
}

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly callReconciliationRpc: ProfileRpcTransport) {}

  async reconcileVerifiedEmployee(identity: VerifiedEmployeeProfileIdentity): Promise<ProfileReconciliation> {
    const verifiedIdentity = validateVerifiedEmployeeProfileIdentity(identity);

    let response;
    try {
      response = await this.callReconciliationRpc({
        p_portal_installation_id: verifiedIdentity.portalInstallationId,
        p_bitrix_user_id: verifiedIdentity.user.id,
        p_bitrix_active: verifiedIdentity.user.active,
        p_bitrix_user_type: verifiedIdentity.user.userType,
      });
    } catch {
      throw new ProfileStorageError();
    }

    if (response.error !== null) throw new ProfileStorageError();

    const parsed = rpcResultSchema.safeParse(response.data);
    if (!parsed.success) throw new ProfileStorageError();

    const row = parsed.data[0];
    if (
      row.portal_installation_id !== verifiedIdentity.portalInstallationId ||
      row.bitrix_user_id !== verifiedIdentity.user.id ||
      row.bitrix_active !== true ||
      row.bitrix_user_type !== "employee" ||
      (row.outcome === "created" && (row.role !== "editor" || !row.is_active)) ||
      (row.outcome === "inactive" && row.is_active) ||
      (row.outcome !== "inactive" && !row.is_active)
    ) {
      throw new ProfileStorageError();
    }

    const profile: Profile = {
      id: row.id,
      portalInstallationId: row.portal_installation_id,
      bitrixUserId: row.bitrix_user_id,
      role: row.role,
      isActive: row.is_active,
      identitySnapshot: {
        active: row.bitrix_active,
        userType: row.bitrix_user_type,
        verifiedAt: row.last_identity_verified_at,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { outcome: row.outcome, profile };
  }
}

export function createSupabaseProfileRepository(): ProfileRepository {
  return new SupabaseProfileRepository(reconcileProfileRpc);
}

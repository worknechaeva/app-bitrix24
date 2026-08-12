import "server-only";

import { z } from "zod";
import {
  blockProfileRpc,
  bootstrapFirstAdministratorRpc,
  changeProfileRoleRpc,
  type FirstAdministratorBootstrapTransport,
  type ProfileBlockTransport,
  type ProfileRoleChangeTransport,
} from "@/server/database/supabase-privileged-gateway";
import {
  type FirstAdministratorBootstrap,
  type ProfileBlock,
  type ProfileLifecycleRepository,
  type ProfileRoleChange,
  validateBlockInput,
  validateBootstrapInput,
  validateRoleChangeInput,
} from "./profile-lifecycle-repository";

const bootstrapResultSchema = z
  .array(
    z
      .object({
        outcome: z.enum([
          "promoted",
          "already_administrator",
          "active_administrator_exists",
          "already_completed",
          "profile_unknown",
          "profile_inactive",
          "identity_mismatch",
        ]),
        role: z.enum(["editor", "administrator"]).nullable(),
        admin_bootstrapped_at: z.iso.datetime({ offset: true }).nullable(),
      })
      .strict(),
  )
  .length(1);

const roleChangeResultSchema = z
  .array(
    z
      .object({
        outcome: z.enum([
          "updated",
          "unchanged",
          "unauthorized",
          "target_unknown",
          "target_inactive",
          "last_administrator",
        ]),
        role: z.enum(["editor", "administrator"]).nullable(),
      })
      .strict(),
  )
  .length(1);

const blockResultSchema = z
  .array(
    z
      .object({
        outcome: z.enum([
          "blocked",
          "already_blocked",
          "unauthorized",
          "target_unknown",
          "last_administrator",
        ]),
        sessions_revoked: z.number().int().nonnegative(),
        credentials_disabled: z.number().int().nonnegative(),
      })
      .strict(),
  )
  .length(1);

export class ProfileLifecycleStorageError extends Error {
  readonly code = "profile_lifecycle_storage_failure";

  constructor() {
    super("Profile lifecycle storage failure");
    this.name = "ProfileLifecycleStorageError";
  }
}

export class SupabaseProfileLifecycleRepository implements ProfileLifecycleRepository {
  constructor(
    private readonly bootstrapAdministrator: FirstAdministratorBootstrapTransport,
    private readonly changeProfileRole: ProfileRoleChangeTransport,
    private readonly blockProfile: ProfileBlockTransport,
  ) {}

  async bootstrapFirstAdministrator(input: {
    portalInstallationId: number;
    profileId: string;
    verifiedBitrixUserId: string;
  }): Promise<FirstAdministratorBootstrap> {
    const validated = validateBootstrapInput(input);
    const response = await this.safeCall(() =>
      this.bootstrapAdministrator({
        p_portal_installation_id: validated.portalInstallationId,
        p_profile_id: validated.profileId,
        p_verified_bitrix_user_id: validated.verifiedBitrixUserId,
      }),
    );
    const parsed = bootstrapResultSchema.safeParse(response.data);
    if (response.error !== null || !parsed.success) throw new ProfileLifecycleStorageError();
    const row = parsed.data[0];
    if (
      ["promoted", "already_administrator", "active_administrator_exists", "already_completed"].includes(
        row.outcome,
      ) &&
      (row.role === null || row.admin_bootstrapped_at === null)
    ) {
      throw new ProfileLifecycleStorageError();
    }
    return {
      outcome: row.outcome,
      role: row.role,
      adminBootstrappedAt: row.admin_bootstrapped_at,
    };
  }

  async changeRole(input: {
    actorSessionTokenHash: string;
    targetProfileId: string;
    role: "editor" | "administrator";
  }): Promise<ProfileRoleChange> {
    const validated = validateRoleChangeInput(input);
    const response = await this.safeCall(() =>
      this.changeProfileRole({
        p_actor_session_token_hash: validated.actorSessionTokenHash,
        p_target_profile_id: validated.targetProfileId,
        p_new_role: validated.role,
      }),
    );
    const parsed = roleChangeResultSchema.safeParse(response.data);
    if (response.error !== null || !parsed.success) throw new ProfileLifecycleStorageError();
    const row = parsed.data[0];
    if (["updated", "unchanged", "last_administrator"].includes(row.outcome) && row.role === null) {
      throw new ProfileLifecycleStorageError();
    }
    return row;
  }

  async block(input: { actorSessionTokenHash: string; targetProfileId: string }): Promise<ProfileBlock> {
    const validated = validateBlockInput(input);
    const response = await this.safeCall(() =>
      this.blockProfile({
        p_actor_session_token_hash: validated.actorSessionTokenHash,
        p_target_profile_id: validated.targetProfileId,
      }),
    );
    const parsed = blockResultSchema.safeParse(response.data);
    if (response.error !== null || !parsed.success) throw new ProfileLifecycleStorageError();
    const row = parsed.data[0];
    return {
      outcome: row.outcome,
      sessionsRevoked: row.sessions_revoked,
      credentialsDisabled: row.credentials_disabled,
    };
  }

  private async safeCall<T>(callback: () => Promise<T>): Promise<T> {
    try {
      return await callback();
    } catch {
      throw new ProfileLifecycleStorageError();
    }
  }
}

export function createSupabaseProfileLifecycleRepository(): ProfileLifecycleRepository {
  return new SupabaseProfileLifecycleRepository(
    bootstrapFirstAdministratorRpc,
    changeProfileRoleRpc,
    blockProfileRpc,
  );
}

import "server-only";

import { z } from "zod";
import { validateAppSessionTokenHash } from "@/server/auth/app-session-repository";
import type { ProfileRole } from "./profile-repository";

const profileIdSchema = z.uuid();
const bitrixUserIdSchema = z.string().regex(/^[1-9][0-9]{0,63}$/);

export type FirstAdministratorBootstrap = {
  outcome:
    | "promoted"
    | "already_administrator"
    | "active_administrator_exists"
    | "already_completed"
    | "profile_unknown"
    | "profile_inactive"
    | "identity_mismatch";
  role: ProfileRole | null;
  adminBootstrappedAt: string | null;
};

export type ProfileRoleChange = {
  outcome:
    "updated" | "unchanged" | "unauthorized" | "target_unknown" | "target_inactive" | "last_administrator";
  role: ProfileRole | null;
};

export type ProfileBlock = {
  outcome: "blocked" | "already_blocked" | "unauthorized" | "target_unknown" | "last_administrator";
  sessionsRevoked: number;
  credentialsDisabled: number;
};

export class ProfileLifecycleInputError extends Error {
  readonly code = "invalid_profile_lifecycle_input";

  constructor() {
    super("Invalid profile lifecycle input");
    this.name = "ProfileLifecycleInputError";
  }
}

export function validateBootstrapInput(input: {
  portalInstallationId: number;
  profileId: string;
  verifiedBitrixUserId: string;
}) {
  const parsed = z
    .object({
      portalInstallationId: z.literal(1),
      profileId: profileIdSchema,
      verifiedBitrixUserId: bitrixUserIdSchema,
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw new ProfileLifecycleInputError();
  return parsed.data;
}

export function validateRoleChangeInput(input: {
  actorSessionTokenHash: string;
  targetProfileId: string;
  role: ProfileRole;
}) {
  let actorSessionTokenHash: string;
  try {
    actorSessionTokenHash = validateAppSessionTokenHash(input.actorSessionTokenHash);
  } catch {
    throw new ProfileLifecycleInputError();
  }
  const parsed = z
    .object({ targetProfileId: profileIdSchema, role: z.enum(["editor", "administrator"]) })
    .strict()
    .safeParse({ targetProfileId: input.targetProfileId, role: input.role });
  if (!parsed.success) throw new ProfileLifecycleInputError();
  return { actorSessionTokenHash, ...parsed.data };
}

export function validateBlockInput(input: { actorSessionTokenHash: string; targetProfileId: string }) {
  let actorSessionTokenHash: string;
  try {
    actorSessionTokenHash = validateAppSessionTokenHash(input.actorSessionTokenHash);
  } catch {
    throw new ProfileLifecycleInputError();
  }
  const parsed = profileIdSchema.safeParse(input.targetProfileId);
  if (!parsed.success) throw new ProfileLifecycleInputError();
  return { actorSessionTokenHash, targetProfileId: parsed.data };
}

export interface ProfileLifecycleRepository {
  bootstrapFirstAdministrator(input: {
    portalInstallationId: number;
    profileId: string;
    verifiedBitrixUserId: string;
  }): Promise<FirstAdministratorBootstrap>;

  changeRole(input: {
    actorSessionTokenHash: string;
    targetProfileId: string;
    role: ProfileRole;
  }): Promise<ProfileRoleChange>;

  block(input: { actorSessionTokenHash: string; targetProfileId: string }): Promise<ProfileBlock>;
}

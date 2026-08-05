import "server-only";

import { z } from "zod";
import type { Bitrix24CurrentUser } from "@/integrations/bitrix24/identity-client";

const bitrixUserIdSchema = z.string().regex(/^[1-9][0-9]{0,63}$/);

const verifiedEmployeeIdentitySchema = z
  .object({
    portalInstallationId: z.literal(1),
    user: z
      .object({
        id: bitrixUserIdSchema,
        active: z.literal(true),
        userType: z.literal("employee"),
      })
      .strict(),
  })
  .strict();

export type VerifiedEmployeeProfileIdentity = {
  portalInstallationId: 1;
  user: Bitrix24CurrentUser & { active: true; userType: "employee" };
};

export type ProfileRole = "editor" | "administrator";

export type Profile = {
  id: string;
  portalInstallationId: number;
  bitrixUserId: string;
  role: ProfileRole;
  isActive: boolean;
  identitySnapshot: {
    active: boolean;
    userType: string;
    verifiedAt: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type ProfileReconciliation = {
  outcome: "created" | "unchanged" | "snapshot_updated" | "inactive";
  profile: Profile;
};

export class ProfileIdentityError extends Error {
  readonly code = "invalid_verified_employee_identity";

  constructor() {
    super("Invalid verified employee identity");
    this.name = "ProfileIdentityError";
  }
}

export function validateVerifiedEmployeeProfileIdentity(
  identity: VerifiedEmployeeProfileIdentity,
): VerifiedEmployeeProfileIdentity {
  const parsed = verifiedEmployeeIdentitySchema.safeParse(identity);
  if (!parsed.success) throw new ProfileIdentityError();
  return parsed.data;
}

export interface ProfileRepository {
  /**
   * Atomically creates or refreshes a local profile after portal, ACTIVE, and
   * USER_TYPE have already been verified by the server-side identity flow.
   */
  reconcileVerifiedEmployee(identity: VerifiedEmployeeProfileIdentity): Promise<ProfileReconciliation>;
}

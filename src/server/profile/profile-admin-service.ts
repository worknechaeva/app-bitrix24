import "server-only";

import { hashAppSessionToken } from "@/server/auth/app-session-service";
import type { LiveApplicationSessionAuthority } from "@/server/auth/application-session";
import type { ProfileRole } from "./profile-repository";
import type {
  ProfileBlock,
  ProfileLifecycleRepository,
  ProfileRoleChange,
} from "./profile-lifecycle-repository";

export type ProfileAdminAuthorizationFailure = { outcome: "unauthorized" };

export type ProfileAdminAuthorityProvider = () => Promise<LiveApplicationSessionAuthority | null>;

export class ProfileAdminService {
  constructor(
    private readonly getAuthority: ProfileAdminAuthorityProvider,
    private readonly lifecycleRepository: ProfileLifecycleRepository,
  ) {}

  async changeRole(input: {
    targetProfileId: string;
    role: ProfileRole;
  }): Promise<ProfileRoleChange | ProfileAdminAuthorizationFailure> {
    const authority = await this.getActiveAdministrator();
    if (!authority) return { outcome: "unauthorized" };
    return this.lifecycleRepository.changeRole({
      actorSessionTokenHash: hashAppSessionToken(authority.sessionToken),
      targetProfileId: input.targetProfileId,
      role: input.role,
    });
  }

  async block(input: { targetProfileId: string }): Promise<ProfileBlock | ProfileAdminAuthorizationFailure> {
    const authority = await this.getActiveAdministrator();
    if (!authority) return { outcome: "unauthorized" };
    return this.lifecycleRepository.block({
      actorSessionTokenHash: hashAppSessionToken(authority.sessionToken),
      targetProfileId: input.targetProfileId,
    });
  }

  private async getActiveAdministrator(): Promise<LiveApplicationSessionAuthority | null> {
    const authority = await this.getAuthority();
    return authority?.actor.role === "administrator" ? authority : null;
  }
}

import "server-only";

const TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/;

export type AppSessionMetadata = {
  id: string;
  profileId: string;
  portalInstallationId: number;
  createdAt: string;
  expiresAt: string;
};

export type AppSessionActor = {
  sessionId: string;
  profileId: string;
  portalInstallationId: number;
  role: "editor" | "administrator";
  expiresAt: string;
};

export type AppSessionCreation =
  { outcome: "created"; session: AppSessionMetadata } | { outcome: "profile_unknown" | "profile_inactive" };

export type AppSessionResolution =
  | { outcome: "active"; actor: AppSessionActor }
  | { outcome: "unknown" | "expired" | "revoked" | "profile_inactive" };

export type AppSessionRevocation = {
  outcome: "revoked" | "unknown" | "already_revoked" | "expired";
};

export class AppSessionInputError extends Error {
  readonly code = "invalid_app_session_input";

  constructor() {
    super("Invalid app session input");
    this.name = "AppSessionInputError";
  }
}

export function validateAppSessionTokenHash(tokenHash: string): string {
  if (!TOKEN_HASH_PATTERN.test(tokenHash)) throw new AppSessionInputError();
  return tokenHash;
}

export interface AppSessionRepository {
  /** Creates a session from a full SHA-256 hash; raw tokens are not accepted. */
  create(input: {
    portalInstallationId: number;
    profileId: string;
    tokenHash: string;
  }): Promise<AppSessionCreation>;

  /** Resolves current actor context from a full SHA-256 hash without extending expiry. */
  resolve(tokenHash: string): Promise<AppSessionResolution>;

  /** Atomically revokes one session using a full SHA-256 hash. */
  revoke(tokenHash: string): Promise<AppSessionRevocation>;
}

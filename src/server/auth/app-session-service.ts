import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type {
  AppSessionCreation,
  AppSessionRepository,
  AppSessionResolution,
  AppSessionRevocation,
} from "./app-session-repository";

const APP_SESSION_TOKEN_BYTES = 32;
const APP_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashAppSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export class AppSessionServiceError extends Error {
  readonly code = "app_session_service_failure";

  constructor() {
    super("App session service failure");
    this.name = "AppSessionServiceError";
  }
}

export type AppSessionIssuance =
  | {
      outcome: "created";
      token: string;
      session: Extract<AppSessionCreation, { outcome: "created" }>["session"];
    }
  | { outcome: "profile_unknown" | "profile_inactive" };

export class AppSessionService {
  constructor(
    private readonly repository: AppSessionRepository,
    private readonly createRandomBytes: (size: number) => Buffer = randomBytes,
  ) {}

  async issue(input: { portalInstallationId: number; profileId: string }): Promise<AppSessionIssuance> {
    const token = this.createRandomBytes(APP_SESSION_TOKEN_BYTES).toString("base64url");

    let result: AppSessionCreation;
    try {
      result = await this.repository.create({
        portalInstallationId: input.portalInstallationId,
        profileId: input.profileId,
        tokenHash: hashAppSessionToken(token),
      });
    } catch {
      throw new AppSessionServiceError();
    }

    if (result.outcome !== "created") return result;
    return { outcome: "created", token, session: result.session };
  }

  async resolve(token: string): Promise<AppSessionResolution> {
    if (!APP_SESSION_TOKEN_PATTERN.test(token)) return { outcome: "unknown" };

    try {
      return await this.repository.resolve(hashAppSessionToken(token));
    } catch {
      throw new AppSessionServiceError();
    }
  }

  async revoke(token: string): Promise<AppSessionRevocation> {
    if (!APP_SESSION_TOKEN_PATTERN.test(token)) return { outcome: "unknown" };

    try {
      return await this.repository.revoke(hashAppSessionToken(token));
    } catch {
      throw new AppSessionServiceError();
    }
  }
}

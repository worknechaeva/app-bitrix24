import "server-only";

import { z } from "zod";
import {
  createAppSessionRpc,
  resolveAppSessionRpc,
  revokeAppSessionRpc,
  type AppSessionCreateTransport,
  type AppSessionTokenHashTransport,
} from "@/server/database/supabase-privileged-gateway";
import {
  AppSessionInputError,
  type AppSessionCreation,
  type AppSessionRepository,
  type AppSessionResolution,
  type AppSessionRevocation,
  validateAppSessionTokenHash,
} from "./app-session-repository";

const inactiveCreationSchema = z
  .object({
    outcome: z.enum(["profile_unknown", "profile_inactive"]),
    session_id: z.null(),
    profile_id: z.null(),
    portal_installation_id: z.null(),
    created_at: z.null(),
    expires_at: z.null(),
  })
  .strict();

const createdSessionSchema = z
  .object({
    outcome: z.literal("created"),
    session_id: z.uuid(),
    profile_id: z.uuid(),
    portal_installation_id: z.literal(1),
    created_at: z.iso.datetime({ offset: true }),
    expires_at: z.iso.datetime({ offset: true }),
  })
  .strict();

const creationResultSchema = z.array(z.union([createdSessionSchema, inactiveCreationSchema])).length(1);

const inactiveResolutionSchema = z
  .object({
    outcome: z.enum(["unknown", "expired", "revoked", "profile_inactive"]),
    session_id: z.null(),
    profile_id: z.null(),
    portal_installation_id: z.null(),
    role: z.null(),
    expires_at: z.null(),
  })
  .strict();

const activeResolutionSchema = z
  .object({
    outcome: z.literal("active"),
    session_id: z.uuid(),
    profile_id: z.uuid(),
    portal_installation_id: z.literal(1),
    role: z.enum(["editor", "administrator"]),
    expires_at: z.iso.datetime({ offset: true }),
  })
  .strict();

const resolutionResultSchema = z.array(z.union([activeResolutionSchema, inactiveResolutionSchema])).length(1);

const revocationResultSchema = z
  .array(z.object({ outcome: z.enum(["revoked", "unknown", "already_revoked", "expired"]) }).strict())
  .length(1);

const createInputSchema = z
  .object({
    portalInstallationId: z.literal(1),
    profileId: z.uuid(),
    tokenHash: z.string(),
  })
  .strict();

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class AppSessionStorageError extends Error {
  readonly code = "app_session_storage_failure";

  constructor() {
    super("App session storage failure");
    this.name = "AppSessionStorageError";
  }
}

export class SupabaseAppSessionRepository implements AppSessionRepository {
  constructor(
    private readonly createSession: AppSessionCreateTransport,
    private readonly resolveSession: AppSessionTokenHashTransport,
    private readonly revokeSession: AppSessionTokenHashTransport,
  ) {}

  async create(input: {
    portalInstallationId: number;
    profileId: string;
    tokenHash: string;
  }): Promise<AppSessionCreation> {
    const parsedInput = createInputSchema.safeParse(input);
    if (!parsedInput.success) throw new AppSessionInputError();
    const tokenHash = validateAppSessionTokenHash(parsedInput.data.tokenHash);

    let response;
    try {
      response = await this.createSession({
        p_portal_installation_id: parsedInput.data.portalInstallationId,
        p_profile_id: parsedInput.data.profileId,
        p_token_hash: tokenHash,
      });
    } catch {
      throw new AppSessionStorageError();
    }
    if (response.error !== null) throw new AppSessionStorageError();

    const parsed = creationResultSchema.safeParse(response.data);
    if (!parsed.success) throw new AppSessionStorageError();
    const result = parsed.data[0];
    if (result.outcome !== "created") return { outcome: result.outcome };

    if (
      result.profile_id !== parsedInput.data.profileId ||
      result.portal_installation_id !== parsedInput.data.portalInstallationId ||
      new Date(result.expires_at).getTime() - new Date(result.created_at).getTime() !== THIRTY_DAYS_MS
    ) {
      throw new AppSessionStorageError();
    }

    return {
      outcome: "created",
      session: {
        id: result.session_id,
        profileId: result.profile_id,
        portalInstallationId: result.portal_installation_id,
        createdAt: result.created_at,
        expiresAt: result.expires_at,
      },
    };
  }

  async resolve(tokenHashInput: string): Promise<AppSessionResolution> {
    const tokenHash = validateAppSessionTokenHash(tokenHashInput);
    let response;
    try {
      response = await this.resolveSession({ p_token_hash: tokenHash });
    } catch {
      throw new AppSessionStorageError();
    }
    if (response.error !== null) throw new AppSessionStorageError();

    const parsed = resolutionResultSchema.safeParse(response.data);
    if (!parsed.success) throw new AppSessionStorageError();
    const result = parsed.data[0];
    if (result.outcome !== "active") return { outcome: result.outcome };

    return {
      outcome: "active",
      actor: {
        sessionId: result.session_id,
        profileId: result.profile_id,
        portalInstallationId: result.portal_installation_id,
        role: result.role,
        expiresAt: result.expires_at,
      },
    };
  }

  async revoke(tokenHashInput: string): Promise<AppSessionRevocation> {
    const tokenHash = validateAppSessionTokenHash(tokenHashInput);
    let response;
    try {
      response = await this.revokeSession({ p_token_hash: tokenHash });
    } catch {
      throw new AppSessionStorageError();
    }
    if (response.error !== null) throw new AppSessionStorageError();

    const parsed = revocationResultSchema.safeParse(response.data);
    if (!parsed.success) throw new AppSessionStorageError();
    return parsed.data[0];
  }
}

export function createSupabaseAppSessionRepository(): AppSessionRepository {
  return new SupabaseAppSessionRepository(createAppSessionRpc, resolveAppSessionRpc, revokeAppSessionRpc);
}

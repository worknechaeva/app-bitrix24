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

const pgrstCodePattern = /^PGRST[0-9]{3}$/;
const sqlStateCodePattern = /^[0-9A-Z]{5}$/;
const timeoutCodes = new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);
const timeoutNames = new Set([
  "TimeoutError",
  "ConnectTimeoutError",
  "HeadersTimeoutError",
  "BodyTimeoutError",
]);
const connectionCodes = new Set(["ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"]);
const maximumCauseDepth = 3;

export type ProfileLifecycleStorageOperation = "bootstrap" | "change_role" | "block";
export type ProfileLifecycleStorageFailureCategory =
  "pgrst" | "sqlstate" | "timeout" | "connection" | "unknown";
export type ProfileLifecycleStorageDiagnostic = Readonly<{
  operation: ProfileLifecycleStorageOperation;
  category: ProfileLifecycleStorageFailureCategory;
  code?: string;
}>;

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function readStringProperty(value: object, property: "code" | "name"): string | undefined {
  try {
    const candidate = Reflect.get(value, property);
    return typeof candidate === "string" ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function readCause(value: object): unknown {
  try {
    return Reflect.get(value, "cause");
  } catch {
    return undefined;
  }
}

function readRpcResponse(value: unknown): { data: unknown; error: unknown } | undefined {
  if (!isObject(value)) return undefined;
  try {
    return {
      data: Reflect.get(value, "data"),
      error: Reflect.get(value, "error"),
    };
  } catch {
    return undefined;
  }
}

function classifyCode(code: string): Omit<ProfileLifecycleStorageDiagnostic, "operation"> | undefined {
  if (pgrstCodePattern.test(code)) return { category: "pgrst", code };
  if (sqlStateCodePattern.test(code)) return { category: "sqlstate", code };
  if (timeoutCodes.has(code)) return { category: "timeout", code };
  if (connectionCodes.has(code)) return { category: "connection", code };
  return undefined;
}

function classifyStorageFailure(
  operation: ProfileLifecycleStorageOperation,
  source: unknown,
): ProfileLifecycleStorageDiagnostic {
  const visited = new WeakSet<object>();
  let current = source;

  for (let depth = 0; depth <= maximumCauseDepth; depth += 1) {
    if (!isObject(current) || visited.has(current)) break;
    visited.add(current);

    const code = readStringProperty(current, "code");
    if (code !== undefined) {
      const codeClassification = classifyCode(code);
      if (codeClassification !== undefined) {
        return Object.freeze({ operation, ...codeClassification });
      }
    }

    const name = readStringProperty(current, "name");
    if (name !== undefined && timeoutNames.has(name)) {
      return Object.freeze({ operation, category: "timeout" });
    }

    current = readCause(current);
  }

  return Object.freeze({ operation, category: "unknown" });
}

export class ProfileLifecycleStorageError extends Error {
  readonly code = "profile_lifecycle_storage_failure";
  readonly diagnostic: ProfileLifecycleStorageDiagnostic;

  constructor(operation: ProfileLifecycleStorageOperation, source?: unknown) {
    super("Profile lifecycle storage failure");
    this.name = "ProfileLifecycleStorageError";
    this.diagnostic = classifyStorageFailure(operation, source);
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
    const response = await this.safeCall("bootstrap", () =>
      this.bootstrapAdministrator({
        p_portal_installation_id: validated.portalInstallationId,
        p_profile_id: validated.profileId,
        p_verified_bitrix_user_id: validated.verifiedBitrixUserId,
      }),
    );
    const parsed = bootstrapResultSchema.safeParse(response.data);
    if (response.error !== null) throw new ProfileLifecycleStorageError("bootstrap", response.error);
    if (!parsed.success) throw new ProfileLifecycleStorageError("bootstrap");
    const row = parsed.data[0];
    if (
      ["promoted", "already_administrator", "active_administrator_exists", "already_completed"].includes(
        row.outcome,
      ) &&
      (row.role === null || row.admin_bootstrapped_at === null)
    ) {
      throw new ProfileLifecycleStorageError("bootstrap");
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
    const response = await this.safeCall("change_role", () =>
      this.changeProfileRole({
        p_actor_session_token_hash: validated.actorSessionTokenHash,
        p_target_profile_id: validated.targetProfileId,
        p_new_role: validated.role,
      }),
    );
    const parsed = roleChangeResultSchema.safeParse(response.data);
    if (response.error !== null) throw new ProfileLifecycleStorageError("change_role", response.error);
    if (!parsed.success) throw new ProfileLifecycleStorageError("change_role");
    const row = parsed.data[0];
    if (["updated", "unchanged", "last_administrator"].includes(row.outcome) && row.role === null) {
      throw new ProfileLifecycleStorageError("change_role");
    }
    return row;
  }

  async block(input: { actorSessionTokenHash: string; targetProfileId: string }): Promise<ProfileBlock> {
    const validated = validateBlockInput(input);
    const response = await this.safeCall("block", () =>
      this.blockProfile({
        p_actor_session_token_hash: validated.actorSessionTokenHash,
        p_target_profile_id: validated.targetProfileId,
      }),
    );
    const parsed = blockResultSchema.safeParse(response.data);
    if (response.error !== null) throw new ProfileLifecycleStorageError("block", response.error);
    if (!parsed.success) throw new ProfileLifecycleStorageError("block");
    const row = parsed.data[0];
    return {
      outcome: row.outcome,
      sessionsRevoked: row.sessions_revoked,
      credentialsDisabled: row.credentials_disabled,
    };
  }

  private async safeCall(
    operation: ProfileLifecycleStorageOperation,
    callback: () => Promise<unknown>,
  ): Promise<{ data: unknown; error: unknown }> {
    let rawResponse: unknown;
    try {
      rawResponse = await callback();
    } catch (error) {
      throw new ProfileLifecycleStorageError(operation, error);
    }
    const response = readRpcResponse(rawResponse);
    if (response === undefined) throw new ProfileLifecycleStorageError(operation);
    return response;
  }
}

export function createSupabaseProfileLifecycleRepository(): ProfileLifecycleRepository {
  return new SupabaseProfileLifecycleRepository(
    bootstrapFirstAdministratorRpc,
    changeProfileRoleRpc,
    blockProfileRpc,
  );
}

import "server-only";

import { z } from "zod";
import { canonicalBitrix24ClientEndpoint } from "@/integrations/bitrix24/portal-origin";
import {
  createBitrix24UserCredentialsRpc,
  markBitrix24CredentialsReauthRequiredRpc,
  inspectBitrix24CredentialsForVerifiedOAuthRpc,
  replaceBitrix24CredentialsAfterVerifiedOAuthRpc,
  resolveBitrix24UserCredentialsRpc,
  rotateBitrix24UserCredentialsRpc,
  type CredentialCreateTransport,
  type CredentialMarkReauthTransport,
  type CredentialResolveTransport,
  type CredentialRotateTransport,
  type CredentialVerifiedOAuthInspectTransport,
  type CredentialVerifiedOAuthReplaceTransport,
} from "@/server/database/supabase-privileged-gateway";
import {
  BITRIX24_CREDENTIAL_ENCRYPTION_VERSION,
  Bitrix24CredentialInputError,
  type Bitrix24CredentialCreation,
  type Bitrix24CredentialReauthTransition,
  type Bitrix24CredentialRepository,
  type Bitrix24CredentialResolution,
  type Bitrix24CredentialRotation,
  type Bitrix24VerifiedOAuthReplacement,
  type Bitrix24VerifiedOAuthReplacementContext,
  type EncryptedBitrix24Credential,
  type EncryptedCredentialWrite,
  isCanonicalBase64Url,
} from "./bitrix24-credential-repository";

const encodedCiphertextSchema = z.string().min(2).max(32_768).refine(isCanonicalBase64Url);
const encodedIvSchema = z.string().length(16).refine(isCanonicalBase64Url);
const encodedAuthTagSchema = z.string().length(22).refine(isCanonicalBase64Url);

const envelopeInputSchema = z
  .object({
    ciphertext: encodedCiphertextSchema,
    iv: encodedIvSchema,
    authTag: encodedAuthTagSchema,
  })
  .strict();

const identityInputSchema = z.object({ portalInstallationId: z.literal(1), profileId: z.uuid() }).strict();

const writeInputBaseSchema = identityInputSchema
  .extend({
    encryptedAccessToken: envelopeInputSchema,
    encryptedRefreshToken: envelopeInputSchema,
    encryptionVersion: z.literal(BITRIX24_CREDENTIAL_ENCRYPTION_VERSION),
    clientEndpoint: z.string().min(1),
    accessTokenExpiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

function validateWriteInput(input: z.infer<typeof writeInputBaseSchema>, context: z.RefinementCtx) {
  if (input.encryptedAccessToken.iv === input.encryptedRefreshToken.iv) {
    context.addIssue({ code: "custom", path: ["encryptedRefreshToken", "iv"], message: "invalid" });
  }
  try {
    if (canonicalBitrix24ClientEndpoint(input.clientEndpoint) !== input.clientEndpoint) {
      context.addIssue({ code: "custom", path: ["clientEndpoint"], message: "invalid" });
    }
  } catch {
    context.addIssue({ code: "custom", path: ["clientEndpoint"], message: "invalid" });
  }
}

const writeInputSchema = writeInputBaseSchema.superRefine(validateWriteInput);
const rotationInputSchema = writeInputBaseSchema
  .extend({ expectedTokenVersion: z.number().int().positive() })
  .strict()
  .superRefine(validateWriteInput);

const inactiveCredentialColumns = {
  credential_id: z.null(),
  portal_installation_id: z.null(),
  profile_id: z.null(),
  access_token_ciphertext: z.null(),
  access_token_iv: z.null(),
  access_token_auth_tag: z.null(),
  refresh_token_ciphertext: z.null(),
  refresh_token_iv: z.null(),
  refresh_token_auth_tag: z.null(),
  encryption_version: z.null(),
  token_version: z.null(),
  client_endpoint: z.null(),
  access_token_expires_at: z.null(),
  created_at: z.null(),
  updated_at: z.null(),
};

const credentialColumns = {
  credential_id: z.uuid(),
  portal_installation_id: z.literal(1),
  profile_id: z.uuid(),
  access_token_ciphertext: encodedCiphertextSchema,
  access_token_iv: encodedIvSchema,
  access_token_auth_tag: encodedAuthTagSchema,
  refresh_token_ciphertext: encodedCiphertextSchema,
  refresh_token_iv: encodedIvSchema,
  refresh_token_auth_tag: encodedAuthTagSchema,
  encryption_version: z.literal(BITRIX24_CREDENTIAL_ENCRYPTION_VERSION),
  token_version: z.number().int().positive(),
  client_endpoint: z.string().min(1),
  access_token_expires_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
};

const createdResultSchema = z.object({ outcome: z.literal("created"), ...credentialColumns }).strict();
const inactiveCreationResultSchema = z
  .object({
    outcome: z.enum(["profile_unknown", "profile_inactive", "already_exists"]),
    ...inactiveCredentialColumns,
  })
  .strict();
const creationResultSchema = z.array(z.union([createdResultSchema, inactiveCreationResultSchema])).length(1);

const activeResultSchema = z.object({ outcome: z.literal("active"), ...credentialColumns }).strict();
const inactiveResolutionResultSchema = z
  .object({
    outcome: z.enum(["unknown", "profile_inactive", "reauth_required", "disabled"]),
    ...inactiveCredentialColumns,
  })
  .strict();
const resolutionResultSchema = z
  .array(z.union([activeResultSchema, inactiveResolutionResultSchema]))
  .length(1);

const rotationResultSchema = z
  .array(
    z.discriminatedUnion("outcome", [
      z.object({ outcome: z.literal("rotated"), token_version: z.number().int().positive() }).strict(),
      z
        .object({
          outcome: z.enum(["unknown", "profile_inactive", "reauth_required", "disabled", "version_conflict"]),
          token_version: z.null(),
        })
        .strict(),
    ]),
  )
  .length(1);

const reauthResultSchema = z
  .array(
    z
      .object({
        outcome: z.enum([
          "marked",
          "already_reauth_required",
          "unknown",
          "profile_inactive",
          "disabled",
          "version_conflict",
        ]),
      })
      .strict(),
  )
  .length(1);

const replacementContextSchema = z
  .array(
    z.discriminatedUnion("outcome", [
      z
        .object({
          outcome: z.literal("missing"),
          current_token_version: z.null(),
          next_token_version: z.literal(1),
        })
        .strict(),
      z
        .object({
          outcome: z.literal("replaceable"),
          current_token_version: z.number().int().positive(),
          next_token_version: z.number().int().positive(),
        })
        .strict(),
      z
        .object({
          outcome: z.enum(["disabled", "profile_unknown", "profile_inactive"]),
          current_token_version: z.null(),
          next_token_version: z.null(),
        })
        .strict(),
    ]),
  )
  .length(1);

const verifiedReplacementResultSchema = z
  .array(
    z.discriminatedUnion("outcome", [
      z
        .object({ outcome: z.enum(["created", "replaced"]), token_version: z.number().int().positive() })
        .strict(),
      z
        .object({
          outcome: z.enum(["version_conflict", "disabled", "profile_unknown", "profile_inactive"]),
          token_version: z.null(),
        })
        .strict(),
    ]),
  )
  .length(1);

export class Bitrix24CredentialStorageError extends Error {
  readonly code = "bitrix24_credential_storage_failure";

  constructor() {
    super("Bitrix24 credential storage failure");
    this.name = "Bitrix24CredentialStorageError";
  }
}

function mapCredential(
  row: Omit<z.infer<typeof activeResultSchema>, "outcome">,
): EncryptedBitrix24Credential {
  let canonicalEndpoint: string;
  try {
    canonicalEndpoint = canonicalBitrix24ClientEndpoint(row.client_endpoint);
  } catch {
    throw new Bitrix24CredentialStorageError();
  }
  if (row.access_token_iv === row.refresh_token_iv || canonicalEndpoint !== row.client_endpoint) {
    throw new Bitrix24CredentialStorageError();
  }
  if (new Date(row.updated_at).getTime() < new Date(row.created_at).getTime()) {
    throw new Bitrix24CredentialStorageError();
  }

  return {
    id: row.credential_id,
    portalInstallationId: row.portal_installation_id,
    profileId: row.profile_id,
    encryptedAccessToken: {
      ciphertext: row.access_token_ciphertext,
      iv: row.access_token_iv,
      authTag: row.access_token_auth_tag,
    },
    encryptedRefreshToken: {
      ciphertext: row.refresh_token_ciphertext,
      iv: row.refresh_token_iv,
      authTag: row.refresh_token_auth_tag,
    },
    encryptionVersion: row.encryption_version,
    tokenVersion: row.token_version,
    clientEndpoint: row.client_endpoint,
    accessTokenExpiresAt: row.access_token_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function writeArguments(input: EncryptedCredentialWrite) {
  return {
    p_portal_installation_id: input.portalInstallationId,
    p_profile_id: input.profileId,
    p_access_token_ciphertext: input.encryptedAccessToken.ciphertext,
    p_access_token_iv: input.encryptedAccessToken.iv,
    p_access_token_auth_tag: input.encryptedAccessToken.authTag,
    p_refresh_token_ciphertext: input.encryptedRefreshToken.ciphertext,
    p_refresh_token_iv: input.encryptedRefreshToken.iv,
    p_refresh_token_auth_tag: input.encryptedRefreshToken.authTag,
    p_encryption_version: input.encryptionVersion,
    p_client_endpoint: input.clientEndpoint,
    p_access_token_expires_at: input.accessTokenExpiresAt,
  };
}

export class SupabaseBitrix24CredentialRepository implements Bitrix24CredentialRepository {
  constructor(
    private readonly createCredentials: CredentialCreateTransport,
    private readonly resolveCredentials: CredentialResolveTransport,
    private readonly rotateCredentials: CredentialRotateTransport,
    private readonly markReauth: CredentialMarkReauthTransport,
    private readonly inspectVerifiedOAuth: CredentialVerifiedOAuthInspectTransport = inspectBitrix24CredentialsForVerifiedOAuthRpc,
    private readonly replaceVerifiedOAuth: CredentialVerifiedOAuthReplaceTransport = replaceBitrix24CredentialsAfterVerifiedOAuthRpc,
  ) {}

  async createInitial(input: EncryptedCredentialWrite): Promise<Bitrix24CredentialCreation> {
    const parsedInput = writeInputSchema.safeParse(input);
    if (!parsedInput.success) throw new Bitrix24CredentialInputError();
    const response = await this.safeCall(() => this.createCredentials(writeArguments(parsedInput.data)));
    const parsed = creationResultSchema.safeParse(response.data);
    if (!parsed.success) throw new Bitrix24CredentialStorageError();
    const row = parsed.data[0];
    if (row.outcome !== "created") return { outcome: row.outcome };
    if (row.profile_id !== input.profileId || row.portal_installation_id !== input.portalInstallationId) {
      throw new Bitrix24CredentialStorageError();
    }
    return { outcome: "created", credential: mapCredential(row) };
  }

  async resolve(input: {
    portalInstallationId: number;
    profileId: string;
  }): Promise<Bitrix24CredentialResolution> {
    const parsedInput = identityInputSchema.safeParse(input);
    if (!parsedInput.success) throw new Bitrix24CredentialInputError();
    const response = await this.safeCall(() =>
      this.resolveCredentials({
        p_portal_installation_id: parsedInput.data.portalInstallationId,
        p_profile_id: parsedInput.data.profileId,
      }),
    );
    const parsed = resolutionResultSchema.safeParse(response.data);
    if (!parsed.success) throw new Bitrix24CredentialStorageError();
    const row = parsed.data[0];
    if (row.outcome !== "active") return { outcome: row.outcome };
    if (row.profile_id !== input.profileId || row.portal_installation_id !== input.portalInstallationId) {
      throw new Bitrix24CredentialStorageError();
    }
    return { outcome: "active", credential: mapCredential(row) };
  }

  async rotate(
    input: EncryptedCredentialWrite & { expectedTokenVersion: number },
  ): Promise<Bitrix24CredentialRotation> {
    const parsedInput = rotationInputSchema.safeParse(input);
    if (!parsedInput.success) throw new Bitrix24CredentialInputError();
    const response = await this.safeCall(() =>
      this.rotateCredentials({
        ...writeArguments(parsedInput.data),
        p_expected_token_version: parsedInput.data.expectedTokenVersion,
      }),
    );
    const parsed = rotationResultSchema.safeParse(response.data);
    if (!parsed.success) throw new Bitrix24CredentialStorageError();
    const row = parsed.data[0];
    return row.outcome === "rotated"
      ? { outcome: "rotated", tokenVersion: row.token_version }
      : { outcome: row.outcome };
  }

  async markReauthRequired(input: {
    portalInstallationId: number;
    profileId: string;
    expectedTokenVersion: number;
  }): Promise<Bitrix24CredentialReauthTransition> {
    const parsedInput = identityInputSchema
      .extend({ expectedTokenVersion: z.number().int().positive() })
      .strict()
      .safeParse(input);
    if (!parsedInput.success) throw new Bitrix24CredentialInputError();
    const response = await this.safeCall(() =>
      this.markReauth({
        p_portal_installation_id: parsedInput.data.portalInstallationId,
        p_profile_id: parsedInput.data.profileId,
        p_expected_token_version: parsedInput.data.expectedTokenVersion,
      }),
    );
    const parsed = reauthResultSchema.safeParse(response.data);
    if (!parsed.success) throw new Bitrix24CredentialStorageError();
    return parsed.data[0];
  }

  async inspectForVerifiedOAuth(input: {
    portalInstallationId: number;
    profileId: string;
  }): Promise<Bitrix24VerifiedOAuthReplacementContext> {
    const parsedInput = identityInputSchema.safeParse(input);
    if (!parsedInput.success) throw new Bitrix24CredentialInputError();
    const response = await this.safeCall(() =>
      this.inspectVerifiedOAuth({
        p_portal_installation_id: parsedInput.data.portalInstallationId,
        p_profile_id: parsedInput.data.profileId,
      }),
    );
    const parsed = replacementContextSchema.safeParse(response.data);
    if (!parsed.success) throw new Bitrix24CredentialStorageError();
    const row = parsed.data[0];
    if (row.outcome === "missing") return { outcome: "missing", nextTokenVersion: 1 };
    if (row.outcome === "replaceable") {
      if (row.next_token_version !== row.current_token_version + 1) {
        throw new Bitrix24CredentialStorageError();
      }
      return {
        outcome: "replaceable",
        currentTokenVersion: row.current_token_version,
        nextTokenVersion: row.next_token_version,
      };
    }
    return { outcome: row.outcome };
  }

  async replaceAfterVerifiedOAuth(
    input: EncryptedCredentialWrite & {
      expectedCurrentTokenVersion: number | null;
      newTokenVersion: number;
    },
  ): Promise<Bitrix24VerifiedOAuthReplacement> {
    const parsedInput = writeInputBaseSchema
      .extend({
        expectedCurrentTokenVersion: z.number().int().positive().nullable(),
        newTokenVersion: z.number().int().positive(),
      })
      .strict()
      .superRefine(validateWriteInput)
      .safeParse(input);
    if (!parsedInput.success) throw new Bitrix24CredentialInputError();
    const response = await this.safeCall(() =>
      this.replaceVerifiedOAuth({
        ...writeArguments(parsedInput.data),
        p_expected_current_token_version: parsedInput.data.expectedCurrentTokenVersion,
        p_new_token_version: parsedInput.data.newTokenVersion,
      }),
    );
    const parsed = verifiedReplacementResultSchema.safeParse(response.data);
    if (!parsed.success) throw new Bitrix24CredentialStorageError();
    const row = parsed.data[0];
    return row.outcome === "created" || row.outcome === "replaced"
      ? { outcome: row.outcome, tokenVersion: row.token_version }
      : { outcome: row.outcome };
  }

  private async safeCall(call: () => Promise<{ data: unknown; error: unknown }>) {
    let response;
    try {
      response = await call();
    } catch {
      throw new Bitrix24CredentialStorageError();
    }
    if (response.error !== null) throw new Bitrix24CredentialStorageError();
    return response;
  }
}

export function createSupabaseBitrix24CredentialRepository(): Bitrix24CredentialRepository {
  return new SupabaseBitrix24CredentialRepository(
    createBitrix24UserCredentialsRpc,
    resolveBitrix24UserCredentialsRpc,
    rotateBitrix24UserCredentialsRpc,
    markBitrix24CredentialsReauthRequiredRpc,
    inspectBitrix24CredentialsForVerifiedOAuthRpc,
    replaceBitrix24CredentialsAfterVerifiedOAuthRpc,
  );
}

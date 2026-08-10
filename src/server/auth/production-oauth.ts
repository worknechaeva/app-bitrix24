import "server-only";

import { Bitrix24AuthError, type Bitrix24AuthReasonCode } from "@/integrations/bitrix24/auth-errors";
import { FetchBitrix24HttpTransport } from "@/integrations/bitrix24/http-transport";
import type { Bitrix24IdentityClient } from "@/integrations/bitrix24/identity-client";
import { LiveBitrix24IdentityClient } from "@/integrations/bitrix24/live-identity-client";
import { canonicalPortalOriginFromClientEndpoint } from "@/integrations/bitrix24/portal-origin";
import {
  getProductionOAuthConfiguration,
  type ProductionOAuthConfiguration,
} from "@/lib/env/production-oauth";
import type { AppSessionService } from "./app-session-service";
import { createSupabaseAppSessionRepository } from "./supabase-app-session-repository";
import {
  AppSessionService as PersistentAppSessionService,
  AppSessionServiceError,
} from "./app-session-service";
import { readApplicationSessionCookie, serializeApplicationSessionCookie } from "./session-cookie";
import type { Bitrix24CredentialService } from "@/server/credentials/bitrix24-credential-service";
import { createBitrix24CredentialService } from "@/server/credentials/bitrix24-credential-service";
import { createSupabaseBitrix24CredentialRepository } from "@/server/credentials/supabase-bitrix24-credential-repository";
import { OAuthStateService } from "@/server/oauth/oauth-state-service";
import type { OAuthTransactionRepository } from "@/server/oauth/oauth-transaction-repository";
import {
  canonicalizeOAuthReturnPath,
  OAuthTransactionInputError,
} from "@/server/oauth/oauth-transaction-repository";
import { createSupabaseOAuthTransactionRepository } from "@/server/oauth/supabase-oauth-transaction-repository";
import type { PortalInstallationRepository } from "@/server/portal/portal-installation-repository";
import { PortalInstallationIdentityError } from "@/server/portal/portal-installation-repository";
import { createSupabasePortalInstallationRepository } from "@/server/portal/supabase-portal-installation-repository";
import type { ProfileRepository } from "@/server/profile/profile-repository";
import { createSupabaseProfileRepository } from "@/server/profile/supabase-profile-repository";

const SAFE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export type ProductionAuthLogger = {
  info(event: string, details: Record<string, boolean | number | string>): void;
};

export type ProductionOAuthRuntime = {
  config: ProductionOAuthConfiguration;
  identityClient: Bitrix24IdentityClient;
  stateService: OAuthStateService;
  portalRepository: PortalInstallationRepository;
  profileRepository: ProfileRepository;
  credentialService: Bitrix24CredentialService;
  sessionService: AppSessionService;
  logger: ProductionAuthLogger;
};

function safeJson(reasonCode: Bitrix24AuthReasonCode, status: number): Response {
  return Response.json(
    { status: "error", reasonCode },
    { status, headers: { ...SAFE_HEADERS, "Content-Type": "application/json; charset=utf-8" } },
  );
}

export function productionOAuthNotFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { ...SAFE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function statusForReason(reasonCode: Bitrix24AuthReasonCode): number {
  if (
    [
      "inactive_user",
      "external_user",
      "unknown_user_type",
      "profile_inactive",
      "credentials_disabled",
    ].includes(reasonCode)
  )
    return 403;
  if (["token_exchange_failed", "provider_unavailable"].includes(reasonCode)) return 502;
  if (
    [
      "invalid_configuration",
      "storage_failure",
      "crypto_failure",
      "session_failure",
      "internal_error",
    ].includes(reasonCode)
  )
    return 500;
  return 400;
}

function safeFailure(error: unknown): Response {
  const reasonCode = error instanceof Bitrix24AuthError ? error.reasonCode : "internal_error";
  return safeJson(reasonCode, statusForReason(reasonCode));
}

function readSingleParameter(url: URL, name: string): string | undefined {
  const values = url.searchParams.getAll(name);
  return values.length === 1 && values[0] !== "" ? values[0] : undefined;
}

function verifyAdmission(active: boolean, userType: string): void {
  if (!active) throw new Bitrix24AuthError("inactive_user");
  if (userType === "employee") return;
  if (userType === "extranet" || userType === "email" || userType === "external") {
    throw new Bitrix24AuthError("external_user");
  }
  throw new Bitrix24AuthError("unknown_user_type");
}

export async function handleProductionOAuthStart(
  request: Request,
  runtime: ProductionOAuthRuntime,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const values = url.searchParams.getAll("return_path");
    if (values.length > 1 || (values.length === 1 && values[0] === "")) {
      throw new Bitrix24AuthError("invalid_request");
    }
    let returnPath: string;
    try {
      returnPath = canonicalizeOAuthReturnPath(values[0] ?? "/");
    } catch (error) {
      if (error instanceof OAuthTransactionInputError) throw new Bitrix24AuthError("invalid_request");
      throw error;
    }
    const issued = await runtime.stateService.issue(returnPath);
    const location = runtime.identityClient.createAuthorizationUrl({
      state: issued.state,
      redirectUri: runtime.config.callbackUri,
    });
    return new Response(null, { status: 302, headers: { ...SAFE_HEADERS, Location: location } });
  } catch (error) {
    return safeFailure(error);
  }
}

export async function handleProductionOAuthCallback(
  request: Request,
  runtime: ProductionOAuthRuntime,
): Promise<Response> {
  const callback = new URL(request.url);
  const state = readSingleParameter(callback, "state");
  if (!state) return safeJson("invalid_request", 400);

  let returnPath: string;
  try {
    const consumed = await runtime.stateService.consume(state);
    if (consumed.outcome !== "consumed") {
      const reasonCode =
        consumed.outcome === "expired"
          ? "expired_state"
          : consumed.outcome === "already_consumed"
            ? "reused_state"
            : "invalid_state";
      throw new Bitrix24AuthError(reasonCode);
    }
    returnPath = consumed.returnPath;
  } catch (error) {
    return safeFailure(error);
  }

  if (callback.searchParams.has("error")) return safeJson("oauth_denied", 400);
  const code = readSingleParameter(callback, "code");
  if (!code) return safeJson("invalid_request", 400);

  try {
    const authorization = await runtime.identityClient.exchangeAuthorizationCode({
      code,
      redirectUri: runtime.config.callbackUri,
    });
    if (authorization.memberId !== runtime.config.expectedMemberId) {
      throw new Bitrix24AuthError("portal_mismatch");
    }
    const portalOrigin = canonicalPortalOriginFromClientEndpoint(authorization.clientEndpoint);
    if (!authorization.scope.includes(runtime.config.requiredTokenScope)) {
      throw new Bitrix24AuthError("missing_app_scope");
    }
    const permissions = await runtime.identityClient.getApplicationPermissions({
      accessToken: authorization.accessToken,
      clientEndpoint: authorization.clientEndpoint,
    });
    if (!permissions.includes(runtime.config.requiredApplicationPermission)) {
      throw new Bitrix24AuthError("missing_user_brief_permission");
    }
    const currentUser = await runtime.identityClient.getCurrentUser({
      accessToken: authorization.accessToken,
      clientEndpoint: authorization.clientEndpoint,
    });
    if (authorization.userId !== undefined && authorization.userId !== currentUser.id) {
      throw new Bitrix24AuthError("provider_identity_mismatch");
    }
    verifyAdmission(currentUser.active, currentUser.userType);

    try {
      await runtime.portalRepository.reconcileTrustedIdentity({
        memberId: authorization.memberId,
        portalOrigin,
      });
    } catch (error) {
      if (error instanceof PortalInstallationIdentityError) {
        throw new Bitrix24AuthError("portal_mismatch");
      }
      throw error;
    }

    const profile = await runtime.profileRepository.reconcileVerifiedEmployee({
      portalInstallationId: 1,
      user: { id: currentUser.id, active: true, userType: "employee" },
    });
    if (profile.outcome === "inactive") throw new Bitrix24AuthError("profile_inactive");

    const credentials = await runtime.credentialService.replaceAfterVerifiedOAuth({
      portalInstallationId: 1,
      profileId: profile.profile.id,
      accessToken: authorization.accessToken,
      refreshToken: authorization.refreshToken,
      clientEndpoint: authorization.clientEndpoint,
      accessTokenExpiresAt: authorization.accessTokenExpiresAt ?? null,
    });
    if (credentials.outcome === "disabled") throw new Bitrix24AuthError("credentials_disabled");
    if (credentials.outcome === "profile_inactive" || credentials.outcome === "profile_unknown") {
      throw new Bitrix24AuthError("profile_inactive");
    }
    if (credentials.outcome === "version_conflict") {
      throw new Bitrix24AuthError("credential_version_conflict");
    }

    const previousToken = readApplicationSessionCookie(request);
    if (previousToken) {
      try {
        await runtime.sessionService.revoke(previousToken);
      } catch (error) {
        if (error instanceof AppSessionServiceError) throw new Bitrix24AuthError("session_failure");
        throw error;
      }
    }

    let issued;
    try {
      issued = await runtime.sessionService.issue({ portalInstallationId: 1, profileId: profile.profile.id });
    } catch (error) {
      if (error instanceof AppSessionServiceError) throw new Bitrix24AuthError("session_failure");
      throw error;
    }
    if (issued.outcome !== "created") throw new Bitrix24AuthError("profile_inactive");

    runtime.logger.info("bitrix24_oauth_callback", {
      status: "success",
      memberIdMatches: true,
      profileOutcome: profile.outcome,
      credentialOutcome: credentials.outcome,
      sessionOutcome: issued.outcome,
    });
    return new Response(null, {
      status: 302,
      headers: {
        ...SAFE_HEADERS,
        Location: returnPath,
        "Set-Cookie": serializeApplicationSessionCookie(issued.token, issued.session.expiresAt),
      },
    });
  } catch (error) {
    const reasonCode = error instanceof Bitrix24AuthError ? error.reasonCode : "internal_error";
    runtime.logger.info("bitrix24_oauth_callback", { status: "error", reasonCode });
    return safeFailure(error);
  }
}

function readSingleFormValue(form: FormData, name: string): string {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== "string" || values[0] === "") {
    throw new Bitrix24AuthError("invalid_install_payload");
  }
  return values[0];
}

export async function handleProductionOAuthInstall(
  request: Request,
  config: ProductionOAuthConfiguration,
): Promise<Response> {
  try {
    if (request.method !== "POST" || new URL(request.url).search !== "") {
      throw new Bitrix24AuthError("invalid_install_payload");
    }
    const contentType = (request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/x-www-form-urlencoded") {
      throw new Bitrix24AuthError("invalid_install_payload");
    }
    const form = await request.formData();
    if (readSingleFormValue(form, "event") !== "ONAPPINSTALL") {
      throw new Bitrix24AuthError("invalid_install_payload");
    }
    readSingleFormValue(form, "auth[access_token]");
    readSingleFormValue(form, "auth[refresh_token]");
    const memberId = readSingleFormValue(form, "auth[member_id]");
    const portalOrigin = canonicalPortalOriginFromClientEndpoint(
      readSingleFormValue(form, "auth[client_endpoint]"),
    );
    if (memberId !== config.expectedMemberId || portalOrigin !== config.portalOrigin) {
      throw new Bitrix24AuthError("portal_mismatch");
    }
    return Response.json(
      { status: "success" },
      { headers: { ...SAFE_HEADERS, "Content-Type": "application/json; charset=utf-8" } },
    );
  } catch (error) {
    return safeFailure(error);
  }
}

export function createProductionOAuthRuntime(): ProductionOAuthRuntime {
  const config = getProductionOAuthConfiguration();
  const oauthRepository: OAuthTransactionRepository = createSupabaseOAuthTransactionRepository();
  return {
    config,
    identityClient: new LiveBitrix24IdentityClient(config, new FetchBitrix24HttpTransport()),
    stateService: new OAuthStateService(oauthRepository),
    portalRepository: createSupabasePortalInstallationRepository(),
    profileRepository: createSupabaseProfileRepository(),
    credentialService: createBitrix24CredentialService(createSupabaseBitrix24CredentialRepository()),
    sessionService: new PersistentAppSessionService(createSupabaseAppSessionRepository()),
    logger: { info: (event, details) => console.info(event, details) },
  };
}

export async function withProductionOAuthRuntime(
  callback: (runtime: ProductionOAuthRuntime) => Promise<Response>,
): Promise<Response> {
  try {
    return await callback(createProductionOAuthRuntime());
  } catch (error) {
    return safeFailure(error);
  }
}

export async function withProductionOAuthConfiguration(
  callback: (config: ProductionOAuthConfiguration) => Promise<Response>,
): Promise<Response> {
  try {
    return await callback(getProductionOAuthConfiguration());
  } catch (error) {
    return safeFailure(error);
  }
}

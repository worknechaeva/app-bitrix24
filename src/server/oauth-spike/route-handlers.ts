import "server-only";

import { evaluateOAuthSpikeAdmission } from "@/integrations/bitrix24/spike/admission";
import {
  getSafeOAuthSpikeReason,
  OAuthSpikeError,
  type OAuthSpikeReasonCode,
} from "@/integrations/bitrix24/spike/errors";
import { verifyOAuthSpikePortalIdentity } from "@/integrations/bitrix24/spike/portal-identity";
import { canonicalPortalOriginFromClientEndpoint } from "@/integrations/bitrix24/portal-origin";
import type { OAuthSpikeInstallRuntime, OAuthSpikeUserRuntime } from "./runtime";

const SAFE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeJson(body: Record<string, boolean | string>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: SAFE_HEADERS });
}

function unavailableRuntime(runtime: OAuthSpikeUserRuntime | OAuthSpikeInstallRuntime): Response | undefined {
  if (runtime.status === "disabled") return notFound();
  if (runtime.status === "invalid") {
    return safeJson({ status: "error", reasonCode: "invalid_configuration" }, 500);
  }
  return undefined;
}

function safeError(reasonCode: OAuthSpikeReasonCode, status = 400): Response {
  return safeJson({ status: "error", reasonCode }, status);
}

function readSingleQueryParameter(url: URL, key: string): string | undefined {
  const values = url.searchParams.getAll(key);
  return values.length === 1 && values[0] !== "" ? values[0] : undefined;
}

export function handleOAuthSpikeStart(_request: Request, runtime: OAuthSpikeUserRuntime): Response {
  const unavailable = unavailableRuntime(runtime);
  if (unavailable || runtime.status !== "enabled") return unavailable ?? notFound();

  try {
    const state = runtime.stateStore.issue();
    const authorizationUrl = runtime.identityClient.createAuthorizationUrl({
      state,
      redirectUri: runtime.config.redirectUri,
    });
    return new Response(null, {
      status: 302,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        Location: authorizationUrl,
      },
    });
  } catch (error) {
    return safeError(getSafeOAuthSpikeReason(error), 500);
  }
}

export async function handleOAuthSpikeCallback(
  request: Request,
  runtime: OAuthSpikeUserRuntime,
): Promise<Response> {
  const unavailable = unavailableRuntime(runtime);
  if (unavailable || runtime.status !== "enabled") return unavailable ?? notFound();

  const callbackUrl = new URL(request.url);
  const state = readSingleQueryParameter(callbackUrl, "state");
  if (!state) return safeError("missing_code_or_state");

  try {
    runtime.stateStore.consume(state);
  } catch (error) {
    return safeError(getSafeOAuthSpikeReason(error));
  }

  if (callbackUrl.searchParams.has("error")) return safeError("oauth_denied");

  const code = readSingleQueryParameter(callbackUrl, "code");
  if (!code) return safeError("missing_code_or_state");

  try {
    const authorization = await runtime.identityClient.exchangeAuthorizationCode({
      code,
      redirectUri: runtime.config.redirectUri,
    });
    const portalIdentity = verifyOAuthSpikePortalIdentity(
      authorization,
      runtime.config.expectedMemberId,
      runtime.config.portalOrigin,
    );
    const currentUser = await runtime.identityClient.getCurrentUser({
      accessToken: authorization.accessToken,
      clientEndpoint: authorization.clientEndpoint,
    });
    if (authorization.userId !== undefined && authorization.userId !== currentUser.id) {
      throw new OAuthSpikeError("provider_identity_mismatch");
    }
    const admission = evaluateOAuthSpikeAdmission(currentUser);

    if (!admission.allowed) {
      runtime.logger.info("bitrix24_oauth_spike_callback", {
        status: "denied",
        reasonCode: admission.reasonCode,
        memberIdMatches: true,
        portalOrigin: portalIdentity.canonicalPortalOrigin,
      });
      return safeError(admission.reasonCode, 403);
    }

    runtime.logger.info("bitrix24_oauth_spike_callback", {
      status: "success",
      memberIdMatches: true,
      portalOrigin: portalIdentity.canonicalPortalOrigin,
      admission: "passed",
    });
    return safeJson({
      status: "success",
      memberIdMatches: true,
      portalOrigin: portalIdentity.canonicalPortalOrigin,
      admission: "passed",
    });
  } catch (error) {
    const reasonCode = getSafeOAuthSpikeReason(error);
    runtime.logger.info("bitrix24_oauth_spike_callback", {
      status: "error",
      reasonCode,
    });
    return safeError(
      reasonCode,
      reasonCode === "portal_mismatch" ||
        reasonCode === "portal_origin_mismatch" ||
        reasonCode === "provider_identity_mismatch"
        ? 403
        : 502,
    );
  }
}

function readSingleInstallField(payload: FormData, key: string): string {
  const values = payload.getAll(key);
  if (values.length !== 1 || typeof values[0] !== "string" || values[0].length === 0) {
    throw new OAuthSpikeError("invalid_install_payload");
  }
  return values[0];
}

export async function handleOAuthSpikeInstall(
  request: Request,
  runtime: OAuthSpikeInstallRuntime,
): Promise<Response> {
  const unavailable = unavailableRuntime(runtime);
  if (unavailable || runtime.status !== "enabled") return unavailable ?? notFound();
  if (request.method !== "POST") return safeJson({ status: "error" }, 405);
  if (new URL(request.url).search !== "") return safeError("invalid_install_payload");

  const contentType = (request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    return safeError("invalid_install_payload");
  }

  try {
    const payload = await request.formData();
    if (readSingleInstallField(payload, "event") !== "ONAPPINSTALL") {
      throw new OAuthSpikeError("invalid_install_payload");
    }
    readSingleInstallField(payload, "auth[access_token]");
    readSingleInstallField(payload, "auth[refresh_token]");
    const memberId = readSingleInstallField(payload, "auth[member_id]");
    const clientEndpoint = readSingleInstallField(payload, "auth[client_endpoint]");
    if (!/^[a-f0-9]{32}$/i.test(memberId)) throw new OAuthSpikeError("invalid_install_payload");

    const canonicalPortalOrigin = canonicalPortalOriginFromClientEndpoint(clientEndpoint);
    runtime.logger.info("bitrix24_oauth_spike_install", {
      status: "received_and_discarded",
      memberId,
      portalOrigin: canonicalPortalOrigin,
    });

    return safeJson({ status: "success" });
  } catch (error) {
    return safeError(error instanceof OAuthSpikeError ? error.reasonCode : "invalid_install_payload");
  }
}

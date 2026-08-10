import "server-only";

export type ApplicationRuntimeMode = "mock" | "live";

export function getApplicationRuntimeMode(
  environment: Record<string, string | undefined> = process.env,
): ApplicationRuntimeMode {
  if (environment.NODE_ENV === "production") return "live";
  return environment.APP_RUNTIME_MODE === "live" ? "live" : "mock";
}

export function isOAuthSpikeRequested(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.NODE_ENV !== "production" && environment.BITRIX24_OAUTH_SPIKE_ENABLED === "true";
}

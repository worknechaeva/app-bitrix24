import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

function getIncomingRequestIgnorePattern(): RegExp {
  const logging = nextConfig.logging;
  if (!logging) throw new Error("Expected configured logging");

  const incomingRequests = logging.incomingRequests;

  if (!incomingRequests || typeof incomingRequests === "boolean") {
    throw new Error("Expected a configured incoming-request ignore matcher");
  }

  const [pattern] = incomingRequests.ignore ?? [];
  if (!pattern) throw new Error("Expected one incoming-request ignore matcher");
  return pattern;
}

describe("development incoming-request logging", () => {
  it("suppresses only the exact OAuth callback request target, including its query", () => {
    const pattern = getIncomingRequestIgnorePattern();

    expect(pattern.test("/api/bitrix24/oauth/callback")).toBe(true);
    expect(pattern.test("/api/bitrix24/oauth/callback?code=synthetic&state=synthetic")).toBe(true);

    for (const requestTarget of [
      "/api/bitrix24/oauth/callback-extra?code=synthetic",
      "/api/bitrix24/oauth/callback/nested?code=synthetic",
      "/api/bitrix24/oauth/start",
      "/api/bitrix24/oauth/install",
      "/api/health",
    ]) {
      expect(pattern.test(requestTarget)).toBe(false);
    }
  });
});

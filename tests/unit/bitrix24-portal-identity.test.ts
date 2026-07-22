import { describe, expect, it } from "vitest";
import type { Bitrix24OAuthResult } from "@/integrations/bitrix24/identity-client";
import { canonicalPortalOriginFromClientEndpoint } from "@/integrations/bitrix24/portal-origin";
import {
  verifyOAuthSpikePortalIdentity,
  verifyOAuthSpikeRefreshResult,
} from "@/integrations/bitrix24/spike/portal-identity";

const memberId = "a".repeat(32);

describe("Bitrix24 portal identity", () => {
  it("extracts the canonical origin from a valid REST client endpoint", () => {
    expect(canonicalPortalOriginFromClientEndpoint("https://portal.example/rest/")).toBe(
      "https://portal.example",
    );
  });

  it.each([
    ["https://PORTAL.EXAMPLE/rest/", "https://portal.example"],
    ["https://пример.рф/rest/", "https://xn--e1afmkfd.xn--p1ai"],
  ])("normalizes a predictable host representation: %s", (clientEndpoint, expected) => {
    expect(canonicalPortalOriginFromClientEndpoint(clientEndpoint)).toBe(expected);
  });

  it.each([
    "http://portal.example/rest/",
    "https://user:password@portal.example/rest/",
    "https://portal.example/rest/?token=secret",
    "https://portal.example/rest/#fragment",
    "https://portal.example/rest",
    "https://portal.example/rest/1/token/",
    "https://portal.example./rest/",
    "https://portal.example:8443/rest/",
  ])("rejects an unsafe or malformed client endpoint: %s", (clientEndpoint) => {
    expect(() => canonicalPortalOriginFromClientEndpoint(clientEndpoint)).toThrowError(
      expect.objectContaining({ reasonCode: "invalid_client_endpoint" }),
    );
  });

  it("rejects a member ID mismatch without normalization", () => {
    expect(() =>
      verifyOAuthSpikePortalIdentity(
        { memberId: memberId.toUpperCase(), clientEndpoint: "https://portal.example/rest/" },
        memberId,
        "https://portal.example",
      ),
    ).toThrowError(expect.objectContaining({ reasonCode: "portal_mismatch" }));
  });

  it("compares configured and provider origins after the same normalization", () => {
    expect(
      verifyOAuthSpikePortalIdentity(
        { memberId, clientEndpoint: "https://PORTAL.EXAMPLE/rest/" },
        memberId,
        "https://portal.example",
      ),
    ).toEqual({ memberIdMatches: true, canonicalPortalOrigin: "https://portal.example" });

    expect(() =>
      verifyOAuthSpikePortalIdentity(
        { memberId, clientEndpoint: "https://renamed.example/rest/" },
        memberId,
        "https://portal.example",
      ),
    ).toThrowError(expect.objectContaining({ reasonCode: "portal_origin_mismatch" }));
  });

  it("rechecks portal, scopes and expiry metadata after refresh", () => {
    const refresh: Bitrix24OAuthResult = {
      accessToken: "access",
      refreshToken: "refresh",
      memberId,
      clientEndpoint: "https://portal.example/rest/",
      expiresAt: 1_800_000_000,
      expiresIn: 3600,
      scope: ["basic", "user_brief"],
    };
    const baseline = {
      memberId,
      canonicalPortalOrigin: "https://portal.example",
      scope: ["user_brief", "basic"],
    };

    expect(verifyOAuthSpikeRefreshResult(refresh, baseline)).toEqual({
      memberIdMatches: true,
      canonicalPortalOrigin: "https://portal.example",
    });
    expect(() => verifyOAuthSpikeRefreshResult({ ...refresh, scope: ["user_brief"] }, baseline)).toThrowError(
      expect.objectContaining({ reasonCode: "oauth_metadata_drift" }),
    );
    expect(() => verifyOAuthSpikeRefreshResult({ ...refresh, expiresIn: 0 }, baseline)).toThrowError(
      expect.objectContaining({ reasonCode: "oauth_metadata_drift" }),
    );
    expect(() =>
      verifyOAuthSpikeRefreshResult({ ...refresh, expiresAt: undefined, expiresIn: undefined }, baseline),
    ).toThrowError(expect.objectContaining({ reasonCode: "oauth_metadata_drift" }));
    expect(() =>
      verifyOAuthSpikeRefreshResult({ ...refresh, memberId: "b".repeat(32) }, baseline),
    ).toThrowError(expect.objectContaining({ reasonCode: "portal_mismatch" }));
    expect(() =>
      verifyOAuthSpikeRefreshResult(
        { ...refresh, clientEndpoint: "https://renamed.example/rest/" },
        baseline,
      ),
    ).toThrowError(expect.objectContaining({ reasonCode: "portal_origin_mismatch" }));
  });
});

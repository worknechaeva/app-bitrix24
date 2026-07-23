import "server-only";

import { OAuthSpikeError } from "./spike/errors";

function canonicalPortalOrigin(value: string, expectedPath: "/" | "/rest/"): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new OAuthSpikeError("invalid_client_endpoint");
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.hostname.endsWith(".") ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== expectedPath
  ) {
    throw new OAuthSpikeError("invalid_client_endpoint");
  }

  return url.origin;
}

export function canonicalPortalOriginFromClientEndpoint(clientEndpoint: string): string {
  return canonicalPortalOrigin(clientEndpoint, "/rest/");
}

export function canonicalPortalOriginFromConfiguredOrigin(portalOrigin: string): string {
  return canonicalPortalOrigin(portalOrigin, "/");
}

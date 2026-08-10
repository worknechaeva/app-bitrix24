import "server-only";

export class Bitrix24PortalOriginError extends Error {
  readonly code = "invalid_bitrix24_portal_origin";

  constructor() {
    super("Invalid Bitrix24 portal origin");
    this.name = "Bitrix24PortalOriginError";
  }
}

function canonicalPortalOrigin(value: string, expectedPath: "/" | "/rest/"): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Bitrix24PortalOriginError();
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
    throw new Bitrix24PortalOriginError();
  }

  return url.origin;
}

export function canonicalPortalOriginFromClientEndpoint(clientEndpoint: string): string {
  return canonicalPortalOrigin(clientEndpoint, "/rest/");
}

export function canonicalBitrix24ClientEndpoint(clientEndpoint: string): string {
  return `${canonicalPortalOrigin(clientEndpoint, "/rest/")}/rest/`;
}

export function canonicalPortalOriginFromConfiguredOrigin(portalOrigin: string): string {
  return canonicalPortalOrigin(portalOrigin, "/");
}

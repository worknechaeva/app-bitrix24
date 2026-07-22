import "server-only";

import { OAuthSpikeError } from "./errors";

const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;

export type OAuthSpikeHttpResponse = {
  ok: boolean;
  status: number;
  body: unknown;
};

export interface OAuthSpikeHttpTransport {
  postForm(url: URL, body: URLSearchParams): Promise<OAuthSpikeHttpResponse>;
}

export class FetchOAuthSpikeHttpTransport implements OAuthSpikeHttpTransport {
  async postForm(url: URL, body: URLSearchParams): Promise<OAuthSpikeHttpResponse> {
    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: body.toString(),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new OAuthSpikeError("provider_unavailable");
    }

    if (!response.ok) {
      return { ok: false, status: response.status, body: null };
    }

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new OAuthSpikeError("provider_unavailable");
    }

    let responseText: string;
    try {
      responseText = await response.text();
    } catch {
      throw new OAuthSpikeError("provider_unavailable");
    }

    if (new TextEncoder().encode(responseText).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new OAuthSpikeError("provider_unavailable");
    }

    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText) as unknown;
    } catch {
      throw new OAuthSpikeError("provider_unavailable");
    }

    return { ok: true, status: response.status, body: responseBody };
  }
}

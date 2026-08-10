import "server-only";

import { Bitrix24AuthError } from "./auth-errors";

const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;

export type Bitrix24HttpResponse = { ok: boolean; status: number; body: unknown };

export interface Bitrix24HttpTransport {
  postForm(url: URL, body: URLSearchParams): Promise<Bitrix24HttpResponse>;
}

export class FetchBitrix24HttpTransport implements Bitrix24HttpTransport {
  async postForm(url: URL, body: URLSearchParams): Promise<Bitrix24HttpResponse> {
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
      throw new Bitrix24AuthError("provider_unavailable");
    }

    if (!response.ok) return { ok: false, status: response.status, body: null };

    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new Bitrix24AuthError("provider_unavailable");
    }

    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new Bitrix24AuthError("provider_unavailable");
    }
    if (new TextEncoder().encode(text).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new Bitrix24AuthError("provider_unavailable");
    }

    try {
      return { ok: true, status: response.status, body: JSON.parse(text) as unknown };
    } catch {
      throw new Bitrix24AuthError("provider_unavailable");
    }
  }
}

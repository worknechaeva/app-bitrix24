import "server-only";

import {
  FetchBitrix24HttpTransport,
  type Bitrix24HttpResponse,
  type Bitrix24HttpTransport,
} from "../http-transport";

export type OAuthSpikeHttpResponse = Bitrix24HttpResponse;
export type OAuthSpikeHttpTransport = Bitrix24HttpTransport;

/** Development/test compatibility wrapper around the production-safe transport primitive. */
export class FetchOAuthSpikeHttpTransport extends FetchBitrix24HttpTransport {}

import "server-only";

import { z } from "zod";
import { Bitrix24AuthError } from "./auth-errors";
import type { Bitrix24CurrentUser, Bitrix24IdentityClient, Bitrix24OAuthResult } from "./identity-client";
import type { Bitrix24HttpTransport } from "./http-transport";
import { canonicalBitrix24ClientEndpoint } from "./portal-origin";
import type { ProductionOAuthConfiguration } from "@/lib/env/production-oauth";

const SAFE_NAME = /^[a-z0-9_-]+$/i;
const BITRIX24_USER_ID = /^[1-9][0-9]{0,63}$/;
const MAX_NAMES = 32;
const MAX_NAME_LENGTH = 64;
const MAX_EXPIRES_IN_SECONDS = 366 * 24 * 60 * 60;

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    member_id: z.string().regex(/^[a-f0-9]{32}$/i),
    client_endpoint: z.string().min(1),
    expires: z.number().finite().positive().optional(),
    expires_in: z.number().finite().positive().optional(),
    scope: z.string().min(1),
    user_id: z
      .union([z.string(), z.number()])
      .transform(String)
      .pipe(z.string().regex(BITRIX24_USER_ID))
      .optional(),
  })
  .passthrough();
const permissionResponseSchema = z.object({ result: z.array(z.string()) }).passthrough();
const activeSchema = z
  .union([z.boolean(), z.enum(["Y", "N"])])
  .transform((value) => value === true || value === "Y");
const currentUserSchema = z.object({
  result: z.object({
    ID: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(BITRIX24_USER_ID)),
    ACTIVE: activeSchema,
    USER_TYPE: z.string().optional(),
  }),
});
const userGetSchema = z.object({
  result: z.array(
    z.object({
      ID: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(BITRIX24_USER_ID)),
      ACTIVE: activeSchema,
      USER_TYPE: z.string().min(1),
    }),
  ),
});

export function normalizeBitrix24Names(values: string[]): string[] {
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  if (
    normalized.length === 0 ||
    normalized.length > MAX_NAMES ||
    normalized.some((value) => value.length > MAX_NAME_LENGTH || !SAFE_NAME.test(value))
  ) {
    throw new Bitrix24AuthError("provider_unavailable");
  }
  return normalized;
}

export function normalizeBitrix24AccessTokenExpiry(
  input: { expires?: number; expiresIn?: number },
  nowMs = Date.now(),
): string | null {
  if (input.expires !== undefined) {
    if (!Number.isSafeInteger(input.expires)) throw new Bitrix24AuthError("token_exchange_failed");
    const milliseconds = input.expires * 1000;
    if (!Number.isSafeInteger(milliseconds)) throw new Bitrix24AuthError("token_exchange_failed");
    const date = new Date(milliseconds);
    if (!Number.isFinite(date.getTime()) || milliseconds <= nowMs) {
      throw new Bitrix24AuthError("token_exchange_failed");
    }
    return date.toISOString();
  }
  if (input.expiresIn !== undefined) {
    if (
      !Number.isSafeInteger(input.expiresIn) ||
      input.expiresIn <= 0 ||
      input.expiresIn > MAX_EXPIRES_IN_SECONDS
    ) {
      throw new Bitrix24AuthError("token_exchange_failed");
    }
    return new Date(nowMs + input.expiresIn * 1000).toISOString();
  }
  return null;
}

export class LiveBitrix24IdentityClient implements Bitrix24IdentityClient {
  constructor(
    private readonly config: ProductionOAuthConfiguration,
    private readonly transport: Bitrix24HttpTransport,
    private readonly now: () => number = Date.now,
  ) {}

  createAuthorizationUrl(input: { state: string; redirectUri: string }): string {
    this.assertRedirectUri(input.redirectUri);
    const url = new URL("/oauth/authorize/", this.config.portalOrigin);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.callbackUri);
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  exchangeAuthorizationCode(input: { code: string; redirectUri: string }): Promise<Bitrix24OAuthResult> {
    this.assertRedirectUri(input.redirectUri);
    return this.requestToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.callbackUri,
        code: input.code,
      }),
    );
  }

  refreshTokenPair(input: { refreshToken: string }): Promise<Bitrix24OAuthResult> {
    return this.requestToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: input.refreshToken,
      }),
    );
  }

  async getApplicationPermissions(input: { accessToken: string; clientEndpoint: string }): Promise<string[]> {
    const endpoint = canonicalBitrix24ClientEndpoint(input.clientEndpoint);
    const response = await this.safePost(
      new URL("scope", endpoint),
      new URLSearchParams({ auth: input.accessToken }),
    );
    if (!response.ok) throw new Bitrix24AuthError("provider_unavailable");
    const parsed = permissionResponseSchema.safeParse(response.body);
    if (!parsed.success) throw new Bitrix24AuthError("provider_unavailable");
    return normalizeBitrix24Names(parsed.data.result);
  }

  async getCurrentUser(input: { accessToken: string; clientEndpoint: string }): Promise<Bitrix24CurrentUser> {
    const endpoint = canonicalBitrix24ClientEndpoint(input.clientEndpoint);
    const current = await this.safePost(
      new URL("user.current", endpoint),
      new URLSearchParams({ auth: input.accessToken }),
    );
    if (!current.ok) throw new Bitrix24AuthError("provider_unavailable");
    const parsedCurrent = currentUserSchema.safeParse(current.body);
    if (!parsedCurrent.success) throw new Bitrix24AuthError("provider_unavailable");
    const result = parsedCurrent.data.result;
    if (result.USER_TYPE) return { id: result.ID, active: result.ACTIVE, userType: result.USER_TYPE };

    const users = await this.safePost(
      new URL("user.get", endpoint),
      new URLSearchParams({ auth: input.accessToken, "FILTER[ID]": result.ID }),
    );
    if (!users.ok) throw new Bitrix24AuthError("provider_unavailable");
    const parsedUsers = userGetSchema.safeParse(users.body);
    if (!parsedUsers.success || parsedUsers.data.result.length !== 1) {
      throw new Bitrix24AuthError("provider_identity_mismatch");
    }
    const exact = parsedUsers.data.result[0];
    if (!exact || exact.ID !== result.ID || exact.ACTIVE !== result.ACTIVE) {
      throw new Bitrix24AuthError("provider_identity_mismatch");
    }
    return { id: exact.ID, active: exact.ACTIVE, userType: exact.USER_TYPE };
  }

  private async requestToken(body: URLSearchParams): Promise<Bitrix24OAuthResult> {
    const response = await this.safePost(new URL(this.config.tokenEndpoint), body);
    if (!response.ok) throw new Bitrix24AuthError("token_exchange_failed");
    const parsed = tokenResponseSchema.safeParse(response.body);
    if (!parsed.success) throw new Bitrix24AuthError("token_exchange_failed");
    let clientEndpoint: string;
    try {
      clientEndpoint = canonicalBitrix24ClientEndpoint(parsed.data.client_endpoint);
    } catch {
      throw new Bitrix24AuthError("invalid_client_endpoint");
    }
    return {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      memberId: parsed.data.member_id,
      clientEndpoint,
      scope: normalizeBitrix24Names(parsed.data.scope.split(/[\s,]+/)),
      userId: parsed.data.user_id,
      accessTokenExpiresAt: normalizeBitrix24AccessTokenExpiry(
        { expires: parsed.data.expires, expiresIn: parsed.data.expires_in },
        this.now(),
      ),
    };
  }

  private assertRedirectUri(redirectUri: string): void {
    if (redirectUri !== this.config.callbackUri) throw new Bitrix24AuthError("invalid_configuration");
  }

  private async safePost(url: URL, body: URLSearchParams) {
    try {
      return await this.transport.postForm(url, body);
    } catch (error) {
      if (error instanceof Bitrix24AuthError) throw error;
      throw new Bitrix24AuthError("provider_unavailable");
    }
  }
}

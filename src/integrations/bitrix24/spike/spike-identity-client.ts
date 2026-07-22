import "server-only";

import { z } from "zod";
import type { Bitrix24CurrentUser, Bitrix24IdentityClient, Bitrix24OAuthResult } from "../identity-client";
import { OAuthSpikeError } from "./errors";
import type { OAuthSpikeHttpTransport } from "./http-transport";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  member_id: z.string().min(1),
  client_endpoint: z.string().min(1),
  expires: z.coerce.number().finite().positive().optional(),
  expires_in: z.coerce.number().finite().positive().optional(),
  scope: z.string().optional().default(""),
  user_id: z.union([z.string(), z.number()]).transform(String).optional(),
});

const activeSchema = z
  .union([z.boolean(), z.enum(["Y", "N"])])
  .transform((value) => value === true || value === "Y");

const currentUserSchema = z.object({
  result: z.object({
    ID: z.union([z.string(), z.number()]).transform(String),
    ACTIVE: activeSchema,
    USER_TYPE: z.string().optional(),
  }),
});

const userGetSchema = z.object({
  result: z.array(
    z.object({
      ID: z.union([z.string(), z.number()]).transform(String),
      ACTIVE: activeSchema,
      USER_TYPE: z.string().min(1),
    }),
  ),
});

export type SpikeBitrix24IdentityClientConfig = {
  portalOrigin: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  tokenEndpoint: string;
};

export class SpikeBitrix24IdentityClient implements Bitrix24IdentityClient {
  constructor(
    private readonly config: SpikeBitrix24IdentityClientConfig,
    private readonly transport: OAuthSpikeHttpTransport,
  ) {}

  createAuthorizationUrl(input: { state: string; redirectUri: string }): string {
    if (input.redirectUri !== this.config.redirectUri) {
      throw new OAuthSpikeError("invalid_configuration");
    }

    const url = new URL("/oauth/authorize/", this.config.portalOrigin);
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  exchangeAuthorizationCode(input: { code: string; redirectUri: string }): Promise<Bitrix24OAuthResult> {
    if (input.redirectUri !== this.config.redirectUri) {
      throw new OAuthSpikeError("invalid_configuration");
    }

    return this.requestToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
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

  async getCurrentUser(input: { accessToken: string; clientEndpoint: string }): Promise<Bitrix24CurrentUser> {
    const currentResponse = await this.safePost(
      new URL("user.current", input.clientEndpoint),
      new URLSearchParams({ auth: input.accessToken }),
    );
    if (!currentResponse.ok) {
      throw new OAuthSpikeError("provider_unavailable");
    }
    const currentUser = currentUserSchema.safeParse(currentResponse.body);
    if (!currentUser.success) throw new OAuthSpikeError("provider_unavailable");

    if (currentUser.data.result.USER_TYPE) {
      return {
        id: currentUser.data.result.ID,
        active: currentUser.data.result.ACTIVE,
        userType: currentUser.data.result.USER_TYPE,
      };
    }

    const userResponse = await this.safePost(
      new URL("user.get", input.clientEndpoint),
      new URLSearchParams({
        auth: input.accessToken,
        "FILTER[ID]": currentUser.data.result.ID,
      }),
    );
    if (!userResponse.ok) {
      throw new OAuthSpikeError("provider_unavailable");
    }
    const users = userGetSchema.safeParse(userResponse.body);
    if (!users.success) throw new OAuthSpikeError("provider_unavailable");
    if (users.data.result.length !== 1) {
      throw new OAuthSpikeError("provider_identity_mismatch");
    }

    const exactUser = users.data.result[0];
    if (
      !exactUser ||
      exactUser.ID !== currentUser.data.result.ID ||
      exactUser.ACTIVE !== currentUser.data.result.ACTIVE
    ) {
      throw new OAuthSpikeError("provider_identity_mismatch");
    }

    return {
      id: exactUser.ID,
      active: currentUser.data.result.ACTIVE,
      userType: exactUser.USER_TYPE,
    };
  }

  private async requestToken(body: URLSearchParams): Promise<Bitrix24OAuthResult> {
    const response = await this.safePost(new URL(this.config.tokenEndpoint), body);
    if (!response.ok) {
      throw new OAuthSpikeError("token_exchange_failed");
    }
    const parsed = tokenResponseSchema.safeParse(response.body);
    if (!parsed.success) throw new OAuthSpikeError("token_exchange_failed");

    const result: Bitrix24OAuthResult = {
      accessToken: parsed.data.access_token,
      refreshToken: parsed.data.refresh_token,
      memberId: parsed.data.member_id,
      clientEndpoint: parsed.data.client_endpoint,
      expiresAt: parsed.data.expires,
      expiresIn: parsed.data.expires_in,
      scope: parsed.data.scope
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean),
      userId: parsed.data.user_id,
    };

    return result;
  }

  private async safePost(url: URL, body: URLSearchParams) {
    try {
      return await this.transport.postForm(url, body);
    } catch (error) {
      if (error instanceof OAuthSpikeError) throw error;
      throw new OAuthSpikeError("provider_unavailable");
    }
  }
}

import "server-only";

export type Bitrix24OAuthTokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type Bitrix24OAuthResult = Bitrix24OAuthTokenPair & {
  memberId: string;
  clientEndpoint: string;
  expiresAt?: number;
  expiresIn?: number;
  scope: string[];
  userId?: string;
};

export type Bitrix24CurrentUser = {
  id: string;
  active: boolean;
  userType: string;
};

export interface Bitrix24IdentityClient {
  createAuthorizationUrl(input: { state: string; redirectUri: string }): string;
  exchangeAuthorizationCode(input: { code: string; redirectUri: string }): Promise<Bitrix24OAuthResult>;
  refreshTokenPair(input: { refreshToken: string }): Promise<Bitrix24OAuthResult>;
  getApplicationPermissions(input: { accessToken: string; clientEndpoint: string }): Promise<string[]>;
  getCurrentUser(input: { accessToken: string; clientEndpoint: string }): Promise<Bitrix24CurrentUser>;
}

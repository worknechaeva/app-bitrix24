import "server-only";

export type Bitrix24OAuthTokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type Bitrix24AuthorizationResult = Bitrix24OAuthTokenPair & {
  memberId: string;
  domain: string;
};

export type Bitrix24CurrentUser = {
  id: string;
  active: boolean;
  userType: string;
};

export interface Bitrix24IdentityClient {
  createAuthorizationUrl(input: { state: string; redirectUri: string }): string;
  exchangeAuthorizationCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<Bitrix24AuthorizationResult>;
  refreshTokenPair(input: { refreshToken: string }): Promise<Bitrix24OAuthTokenPair>;
  getCurrentUser(input: { accessToken: string }): Promise<Bitrix24CurrentUser>;
}

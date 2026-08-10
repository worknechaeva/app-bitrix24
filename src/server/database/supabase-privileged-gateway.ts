import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePrivilegedConfiguration } from "@/lib/env/supabase";

export type PortalInstallationRpcArguments = {
  p_member_id: string;
  p_portal_origin: string;
};

export type PortalInstallationRpcResponse = {
  data: unknown;
  error: unknown;
};

export type PortalInstallationRpcTransport = (
  arguments_: PortalInstallationRpcArguments,
) => Promise<PortalInstallationRpcResponse>;

export type ProfileRpcArguments = {
  p_portal_installation_id: number;
  p_bitrix_user_id: string;
  p_bitrix_active: boolean;
  p_bitrix_user_type: string;
};

export type ProfileRpcResponse = {
  data: unknown;
  error: unknown;
};

export type ProfileRpcTransport = (arguments_: ProfileRpcArguments) => Promise<ProfileRpcResponse>;

export type OAuthTransactionCreateArguments = {
  state_hash: string;
  return_path: string;
};

export type OAuthTransactionConsumeArguments = {
  p_state_hash: string;
};

export type OAuthTransactionResponse = {
  data: unknown;
  error: unknown;
};

export type OAuthTransactionCreateTransport = (
  arguments_: OAuthTransactionCreateArguments,
) => Promise<OAuthTransactionResponse>;

export type OAuthTransactionConsumeTransport = (
  arguments_: OAuthTransactionConsumeArguments,
) => Promise<OAuthTransactionResponse>;

export type AppSessionCreateArguments = {
  p_portal_installation_id: number;
  p_profile_id: string;
  p_token_hash: string;
};

export type AppSessionTokenHashArguments = {
  p_token_hash: string;
};

export type AppSessionRpcResponse = {
  data: unknown;
  error: unknown;
};

export type AppSessionCreateTransport = (
  arguments_: AppSessionCreateArguments,
) => Promise<AppSessionRpcResponse>;

export type AppSessionTokenHashTransport = (
  arguments_: AppSessionTokenHashArguments,
) => Promise<AppSessionRpcResponse>;

function createPrivilegedClient() {
  const configuration = getSupabasePrivilegedConfiguration();
  return createClient(configuration.url, configuration.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export const reconcilePortalInstallationRpc: PortalInstallationRpcTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("reconcile_portal_installation", arguments_);
};

export const reconcileProfileRpc: ProfileRpcTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("reconcile_profile", arguments_);
};

export const createOAuthTransactionRow: OAuthTransactionCreateTransport = async (arguments_) => {
  return createPrivilegedClient()
    .from("oauth_transactions")
    .insert(arguments_)
    .select("id,return_path,created_at,expires_at")
    .single();
};

export const consumeOAuthTransactionRpc: OAuthTransactionConsumeTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("consume_oauth_transaction", arguments_);
};

export const createAppSessionRpc: AppSessionCreateTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("create_app_session", arguments_);
};

export const resolveAppSessionRpc: AppSessionTokenHashTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("resolve_app_session", arguments_);
};

export const revokeAppSessionRpc: AppSessionTokenHashTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("revoke_app_session", arguments_);
};

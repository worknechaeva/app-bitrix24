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

export type FirstAdministratorBootstrapArguments = {
  p_portal_installation_id: number;
  p_profile_id: string;
  p_verified_bitrix_user_id: string;
};

export type ProfileRoleChangeArguments = {
  p_actor_session_token_hash: string;
  p_target_profile_id: string;
  p_new_role: "editor" | "administrator";
};

export type ProfileBlockArguments = {
  p_actor_session_token_hash: string;
  p_target_profile_id: string;
};

export type ProfileLifecycleRpcResponse = {
  data: unknown;
  error: unknown;
};

export type FirstAdministratorBootstrapTransport = (
  arguments_: FirstAdministratorBootstrapArguments,
) => Promise<ProfileLifecycleRpcResponse>;

export type ProfileRoleChangeTransport = (
  arguments_: ProfileRoleChangeArguments,
) => Promise<ProfileLifecycleRpcResponse>;

export type ProfileBlockTransport = (
  arguments_: ProfileBlockArguments,
) => Promise<ProfileLifecycleRpcResponse>;

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

export type CredentialEnvelopeArguments = {
  p_access_token_ciphertext: string;
  p_access_token_iv: string;
  p_access_token_auth_tag: string;
  p_refresh_token_ciphertext: string;
  p_refresh_token_iv: string;
  p_refresh_token_auth_tag: string;
  p_encryption_version: number;
  p_client_endpoint: string;
  p_access_token_expires_at: string | null;
};

export type CredentialIdentityArguments = {
  p_portal_installation_id: number;
  p_profile_id: string;
};

export type CredentialCreateArguments = CredentialIdentityArguments & CredentialEnvelopeArguments;
export type CredentialResolveArguments = CredentialIdentityArguments;
export type CredentialRotateArguments = CredentialCreateArguments & { p_expected_token_version: number };
export type CredentialMarkReauthArguments = CredentialIdentityArguments & {
  p_expected_token_version: number;
};
export type CredentialVerifiedOAuthInspectArguments = CredentialIdentityArguments;
export type CredentialVerifiedOAuthReplaceArguments = CredentialCreateArguments & {
  p_expected_current_token_version: number | null;
  p_new_token_version: number;
};

export type CredentialRpcResponse = {
  data: unknown;
  error: unknown;
};

export type LauncherProjectListArguments = { p_actor_session_token_hash: string };
export type LauncherProjectSaveArguments = LauncherProjectListArguments & {
  p_project_id: string | null;
  p_creation_operation_key: string | null;
  p_name: string;
  p_website_url: string;
  p_bitrix_entity_id: string;
  p_bitrix_entity_type: "group" | "project" | "scrum";
  p_bitrix_entity_title: string;
  p_required_tag: string;
  p_default_responsible_id: string;
};
export type LauncherProjectArchiveArguments = LauncherProjectListArguments & {
  p_project_id: string;
  p_archived: boolean;
};
export type LauncherProjectRpcTransport<T> = (arguments_: T) => Promise<{ data: unknown; error: unknown }>;

export type CredentialCreateTransport = (
  arguments_: CredentialCreateArguments,
) => Promise<CredentialRpcResponse>;
export type CredentialResolveTransport = (
  arguments_: CredentialResolveArguments,
) => Promise<CredentialRpcResponse>;
export type CredentialRotateTransport = (
  arguments_: CredentialRotateArguments,
) => Promise<CredentialRpcResponse>;
export type CredentialMarkReauthTransport = (
  arguments_: CredentialMarkReauthArguments,
) => Promise<CredentialRpcResponse>;
export type CredentialVerifiedOAuthInspectTransport = (
  arguments_: CredentialVerifiedOAuthInspectArguments,
) => Promise<CredentialRpcResponse>;
export type CredentialVerifiedOAuthReplaceTransport = (
  arguments_: CredentialVerifiedOAuthReplaceArguments,
) => Promise<CredentialRpcResponse>;

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

export const bootstrapFirstAdministratorRpc: FirstAdministratorBootstrapTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("bootstrap_first_administrator", arguments_);
};

export const changeProfileRoleRpc: ProfileRoleChangeTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("change_profile_role", arguments_);
};

export const blockProfileRpc: ProfileBlockTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("block_profile", arguments_);
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

export const createBitrix24UserCredentialsRpc: CredentialCreateTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("create_bitrix24_user_credentials", arguments_);
};

export const resolveBitrix24UserCredentialsRpc: CredentialResolveTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("resolve_bitrix24_user_credentials", arguments_);
};

export const rotateBitrix24UserCredentialsRpc: CredentialRotateTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("rotate_bitrix24_user_credentials", arguments_);
};

export const markBitrix24CredentialsReauthRequiredRpc: CredentialMarkReauthTransport = async (arguments_) => {
  return createPrivilegedClient().rpc("mark_bitrix24_credentials_reauth_required", arguments_);
};

export const inspectBitrix24CredentialsForVerifiedOAuthRpc: CredentialVerifiedOAuthInspectTransport = async (
  arguments_,
) => createPrivilegedClient().rpc("inspect_bitrix24_credentials_for_verified_oauth", arguments_);

export const replaceBitrix24CredentialsAfterVerifiedOAuthRpc: CredentialVerifiedOAuthReplaceTransport =
  async (arguments_) =>
    createPrivilegedClient().rpc("replace_bitrix24_credentials_after_verified_oauth", arguments_);

export const listLauncherProjectsRpc: LauncherProjectRpcTransport<LauncherProjectListArguments> = async (
  arguments_,
) => createPrivilegedClient().rpc("list_launcher_projects", arguments_);
export const saveLauncherProjectRpc: LauncherProjectRpcTransport<LauncherProjectSaveArguments> = async (
  arguments_,
) => createPrivilegedClient().rpc("save_launcher_project", arguments_);
export const setLauncherProjectArchivedRpc: LauncherProjectRpcTransport<
  LauncherProjectArchiveArguments
> = async (arguments_) => createPrivilegedClient().rpc("set_launcher_project_archived", arguments_);

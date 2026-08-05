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

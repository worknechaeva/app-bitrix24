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

export const reconcilePortalInstallationRpc: PortalInstallationRpcTransport = async (arguments_) => {
  const configuration = getSupabasePrivilegedConfiguration();
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return client.rpc("reconcile_portal_installation", arguments_);
};

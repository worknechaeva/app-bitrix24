import { handleOAuthSpikeInstall } from "@/server/oauth-spike/route-handlers";
import { getOAuthSpikeInstallRuntime } from "@/server/oauth-spike/runtime";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleOAuthSpikeInstall(request, getOAuthSpikeInstallRuntime());
}

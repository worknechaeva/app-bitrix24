import { handleOAuthSpikeCallback } from "@/server/oauth-spike/route-handlers";
import { getOAuthSpikeUserRuntime } from "@/server/oauth-spike/runtime";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleOAuthSpikeCallback(request, getOAuthSpikeUserRuntime());
}

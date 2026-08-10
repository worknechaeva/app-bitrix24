import { getApplicationRuntimeMode, isOAuthSpikeRequested } from "@/server/auth/runtime-mode";
import {
  handleProductionOAuthStart,
  productionOAuthNotFound,
  withProductionOAuthRuntime,
} from "@/server/auth/production-oauth";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (isOAuthSpikeRequested()) {
    const [{ handleOAuthSpikeStart }, { getOAuthSpikeUserRuntime }] = await Promise.all([
      import("@/server/oauth-spike/route-handlers"),
      import("@/server/oauth-spike/runtime"),
    ]);
    return handleOAuthSpikeStart(request, getOAuthSpikeUserRuntime());
  }
  if (getApplicationRuntimeMode() === "live") {
    return withProductionOAuthRuntime((runtime) => handleProductionOAuthStart(request, runtime));
  }
  return productionOAuthNotFound();
}

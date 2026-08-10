import { getApplicationRuntimeMode, isOAuthSpikeRequested } from "@/server/auth/runtime-mode";
import {
  handleProductionOAuthCallback,
  productionOAuthNotFound,
  withProductionOAuthRuntime,
} from "@/server/auth/production-oauth";

export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  if (isOAuthSpikeRequested()) {
    return Promise.all([
      import("@/server/oauth-spike/route-handlers"),
      import("@/server/oauth-spike/runtime"),
    ]).then(([{ handleOAuthSpikeCallback }, { getOAuthSpikeUserRuntime }]) =>
      handleOAuthSpikeCallback(request, getOAuthSpikeUserRuntime()),
    );
  }
  if (getApplicationRuntimeMode() === "live") {
    return withProductionOAuthRuntime((runtime) => handleProductionOAuthCallback(request, runtime));
  }
  return Promise.resolve(productionOAuthNotFound());
}

import { getApplicationRuntimeMode, isOAuthSpikeRequested } from "@/server/auth/runtime-mode";
import {
  handleProductionOAuthInstall,
  productionOAuthNotFound,
  withProductionOAuthConfiguration,
} from "@/server/auth/production-oauth";

export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  if (isOAuthSpikeRequested()) {
    return Promise.all([
      import("@/server/oauth-spike/route-handlers"),
      import("@/server/oauth-spike/runtime"),
    ]).then(([{ handleOAuthSpikeInstall }, { getOAuthSpikeInstallRuntime }]) =>
      handleOAuthSpikeInstall(request, getOAuthSpikeInstallRuntime()),
    );
  }
  if (getApplicationRuntimeMode() === "live") {
    return withProductionOAuthConfiguration((config) => handleProductionOAuthInstall(request, config));
  }
  return Promise.resolve(productionOAuthNotFound());
}

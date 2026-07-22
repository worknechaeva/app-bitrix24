import "server-only";

import type { Bitrix24CurrentUser } from "../identity-client";
import type { OAuthSpikeReasonCode } from "./errors";

export type OAuthSpikeAdmissionResult =
  { allowed: true } | { allowed: false; reasonCode: OAuthSpikeReasonCode };

export function evaluateOAuthSpikeAdmission(user: Bitrix24CurrentUser): OAuthSpikeAdmissionResult {
  if (user.active !== true) return { allowed: false, reasonCode: "inactive_user" };
  if (user.userType === "employee") return { allowed: true };
  if (user.userType === "extranet" || user.userType === "email") {
    return { allowed: false, reasonCode: "external_user" };
  }
  return { allowed: false, reasonCode: "unknown_user_type" };
}

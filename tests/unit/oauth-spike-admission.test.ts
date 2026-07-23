import { describe, expect, it } from "vitest";
import { evaluateOAuthSpikeAdmission } from "@/integrations/bitrix24/spike/admission";

describe("OAuth spike admission", () => {
  it("allows only an active employee", () => {
    expect(evaluateOAuthSpikeAdmission({ id: "1", active: true, userType: "employee" })).toEqual({
      allowed: true,
    });
  });

  it("rejects an inactive employee", () => {
    expect(evaluateOAuthSpikeAdmission({ id: "2", active: false, userType: "employee" })).toEqual({
      allowed: false,
      reasonCode: "inactive_user",
    });
  });

  it.each(["extranet", "email"])("rejects the external type %s", (userType) => {
    expect(evaluateOAuthSpikeAdmission({ id: "3", active: true, userType })).toEqual({
      allowed: false,
      reasonCode: "external_user",
    });
  });

  it("fails closed for an unknown user type", () => {
    expect(evaluateOAuthSpikeAdmission({ id: "4", active: true, userType: "collaber" })).toEqual({
      allowed: false,
      reasonCode: "unknown_user_type",
    });
  });

  it("fails closed for an empty user type", () => {
    expect(evaluateOAuthSpikeAdmission({ id: "5", active: true, userType: "" })).toEqual({
      allowed: false,
      reasonCode: "unknown_user_type",
    });
  });
});

import { describe, expect, it } from "vitest";
import { parsePortalConfiguration, PortalConfigurationError } from "@/lib/env/portal";

const memberId = "a".repeat(32);

describe("portal environment", () => {
  it("keeps the portal foundation explicitly unconfigured when both values are absent", () => {
    expect(parsePortalConfiguration({})).toEqual({ configured: false });
    expect(
      parsePortalConfiguration({
        BITRIX24_PORTAL_MEMBER_ID: "",
        BITRIX24_PORTAL_ORIGIN: "",
      }),
    ).toEqual({ configured: false });
  });

  it("parses one server-only portal identity", () => {
    expect(
      parsePortalConfiguration({
        BITRIX24_PORTAL_MEMBER_ID: memberId,
        BITRIX24_PORTAL_ORIGIN: "https://portal.example",
      }),
    ).toEqual({
      configured: true,
      memberId,
      portalOrigin: "https://portal.example",
    });
  });

  it.each([
    { BITRIX24_PORTAL_MEMBER_ID: memberId },
    { BITRIX24_PORTAL_ORIGIN: "https://portal.example" },
    { BITRIX24_PORTAL_MEMBER_ID: "not-a-member-id", BITRIX24_PORTAL_ORIGIN: "https://portal.example" },
    { BITRIX24_PORTAL_MEMBER_ID: memberId, BITRIX24_PORTAL_ORIGIN: "http://portal.example" },
    { BITRIX24_PORTAL_MEMBER_ID: memberId, BITRIX24_PORTAL_ORIGIN: "https://portal.example/rest/" },
    { BITRIX24_PORTAL_MEMBER_ID: memberId, BITRIX24_PORTAL_ORIGIN: "https://portal.example:8443" },
    { BITRIX24_PORTAL_MEMBER_ID: memberId, BITRIX24_PORTAL_ORIGIN: "https://portal.example?source=user" },
  ])("rejects partial or unsafe portal configuration", (environment) => {
    expect(() => parsePortalConfiguration(environment)).toThrowError(PortalConfigurationError);
    expect(() => parsePortalConfiguration(environment)).toThrowError(
      expect.objectContaining({ code: "invalid_portal_configuration" }),
    );
  });
});

import { describe, expect, it } from "vitest";
import { BootstrapAdminConfigurationError, parseBootstrapAdminBitrixUserId } from "@/lib/env/bootstrap-admin";

describe("bootstrap administrator environment", () => {
  it("keeps bootstrap optional and accepts only a canonical Bitrix user ID", () => {
    expect(parseBootstrapAdminBitrixUserId({})).toBeNull();
    expect(parseBootstrapAdminBitrixUserId({ BOOTSTRAP_ADMIN_BITRIX_USER_ID: "" })).toBeNull();
    expect(parseBootstrapAdminBitrixUserId({ BOOTSTRAP_ADMIN_BITRIX_USER_ID: "42" })).toBe("42");
  });

  it.each(["0", "01", " 42", "42 ", "user-42", "1".repeat(65)])(
    "fails closed for invalid value %s without echoing it",
    (value) => {
      expect(() => parseBootstrapAdminBitrixUserId({ BOOTSTRAP_ADMIN_BITRIX_USER_ID: value })).toThrow(
        BootstrapAdminConfigurationError,
      );
      try {
        parseBootstrapAdminBitrixUserId({ BOOTSTRAP_ADMIN_BITRIX_USER_ID: value });
      } catch (error) {
        expect(String(error)).not.toContain(value);
      }
    },
  );
});

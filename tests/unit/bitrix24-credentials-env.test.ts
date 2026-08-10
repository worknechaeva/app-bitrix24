import { describe, expect, it } from "vitest";
import {
  Bitrix24CredentialsConfigurationError,
  parseBitrix24CredentialsEncryptionKey,
} from "@/lib/env/bitrix24-credentials";

describe("Bitrix24 credentials encryption key configuration", () => {
  it("parses exactly 32 base64-encoded bytes", () => {
    const expected = Buffer.alloc(32, 0xa5);
    const parsed = parseBitrix24CredentialsEncryptionKey({
      BITRIX24_CREDENTIALS_ENCRYPTION_KEY: expected.toString("base64"),
    });

    expect(parsed).toEqual(expected);
    expect(parsed).not.toBe(expected);
  });

  it.each([
    undefined,
    "",
    "plain-password",
    "ab".repeat(32),
    Buffer.alloc(31).toString("base64"),
    Buffer.alloc(33).toString("base64"),
    `${Buffer.alloc(32).toString("base64")}garbage`,
    Buffer.alloc(32).toString("base64url"),
  ])("fails closed for missing, ambiguous, or invalid key material", (value) => {
    expect(() =>
      parseBitrix24CredentialsEncryptionKey({ BITRIX24_CREDENTIALS_ENCRYPTION_KEY: value }),
    ).toThrow(Bitrix24CredentialsConfigurationError);

    try {
      parseBitrix24CredentialsEncryptionKey({ BITRIX24_CREDENTIALS_ENCRYPTION_KEY: value });
    } catch (error) {
      expect(String(error)).toBe(
        "Bitrix24CredentialsConfigurationError: Invalid Bitrix24 credentials configuration",
      );
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerEnv } from "@/lib/env/server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server environment", () => {
  it("rejects mock runtime in production without exposing unrelated environment values", () => {
    const timezoneMarker = "unit-test-timezone-marker-must-not-leak";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_RUNTIME_MODE", "mock");
    vi.stubEnv("BITRIX24_TIMEZONE", timezoneMarker);

    let validationError: unknown;
    try {
      getServerEnv();
    } catch (error) {
      validationError = error;
    }

    expect(validationError).toBeInstanceOf(Error);
    expect(String(validationError)).toContain("Mock runtime is forbidden in production");
    expect(String(validationError)).not.toContain(timezoneMarker);
  });
});

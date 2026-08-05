import { describe, expect, it } from "vitest";
import {
  parseSupabasePrivilegedConfiguration,
  SupabasePrivilegedConfigurationError,
} from "@/lib/env/supabase";

const serviceRoleKey = "test-service-role-key-with-safe-minimum-length";

describe("Supabase privileged environment", () => {
  it("accepts HTTPS and a local test URL without exposing public variables", () => {
    expect(
      parseSupabasePrivilegedConfiguration({
        NODE_ENV: "production",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      }),
    ).toEqual({
      url: "https://project.supabase.co",
      serviceRoleKey,
    });

    expect(
      parseSupabasePrivilegedConfiguration({
        NODE_ENV: "test",
        SUPABASE_URL: "http://127.0.0.1:54321",
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      }),
    ).toEqual({
      url: "http://127.0.0.1:54321",
      serviceRoleKey,
    });
  });

  it.each([
    {},
    { SUPABASE_URL: "https://project.supabase.co" },
    { SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey },
    {
      NODE_ENV: "production",
      SUPABASE_URL: "http://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    },
    {
      NODE_ENV: "test",
      SUPABASE_URL: "http://remote.example",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    },
    {
      SUPABASE_URL: "https://project.supabase.co/rest/v1?debug=true",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    },
    {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "replace-with-service-role-key",
    },
  ])("fails closed for an unsafe or partial configuration", (environment) => {
    expect(() => parseSupabasePrivilegedConfiguration(environment)).toThrowError(
      expect.objectContaining<Partial<SupabasePrivilegedConfigurationError>>({
        code: "invalid_supabase_privileged_configuration",
      }),
    );
  });
});

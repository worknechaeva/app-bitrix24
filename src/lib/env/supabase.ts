import "server-only";

import { z } from "zod";

type SupabaseEnvironment = Record<string, string | undefined>;

const serviceRoleKeySchema = z
  .string()
  .min(20)
  .refine((value) => !/placeholder|replace|example/i.test(value));

export type SupabasePrivilegedConfiguration = {
  url: string;
  serviceRoleKey: string;
};

export class SupabasePrivilegedConfigurationError extends Error {
  readonly code = "invalid_supabase_privileged_configuration";

  constructor() {
    super("Invalid Supabase privileged configuration");
    this.name = "SupabasePrivilegedConfigurationError";
  }
}

export function parseSupabasePrivilegedConfiguration(
  environment: SupabaseEnvironment,
): SupabasePrivilegedConfiguration {
  const parsed = z
    .object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      SUPABASE_URL: z.url(),
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKeySchema,
    })
    .safeParse({
      NODE_ENV: environment.NODE_ENV,
      SUPABASE_URL: environment.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: environment.SUPABASE_SERVICE_ROLE_KEY,
    });

  if (!parsed.success) throw new SupabasePrivilegedConfigurationError();

  const url = new URL(parsed.data.SUPABASE_URL);
  const isLocalHttp =
    parsed.data.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");

  if (
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.protocol !== "https:" && !isLocalHttp)
  ) {
    throw new SupabasePrivilegedConfigurationError();
  }

  return {
    url: url.origin,
    serviceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getSupabasePrivilegedConfiguration(): SupabasePrivilegedConfiguration {
  return parseSupabasePrivilegedConfiguration(process.env);
}

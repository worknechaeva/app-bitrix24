import "server-only";

import { z } from "zod";

const serverRuntimeSchema = z.enum(["development", "test", "production"]).default("development");

const serverEnvSchema = z
  .object({
    NODE_ENV: serverRuntimeSchema,
    APP_RUNTIME_MODE: z.enum(["mock", "live"]).default("mock"),
    BITRIX24_MODE: z.enum(["mock", "live"]).default("mock"),
    BITRIX24_TIMEZONE: z.string().default("Europe/Moscow"),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === "production" && env.APP_RUNTIME_MODE === "mock") {
      context.addIssue({
        code: "custom",
        path: ["APP_RUNTIME_MODE"],
        message: "Mock runtime is forbidden in production",
      });
    }
  });

export function getServerEnv() {
  return serverEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    APP_RUNTIME_MODE: process.env.APP_RUNTIME_MODE,
    BITRIX24_MODE: process.env.BITRIX24_MODE,
    BITRIX24_TIMEZONE: process.env.BITRIX24_TIMEZONE,
  });
}

export function getServerRuntime() {
  return serverRuntimeSchema.parse(process.env.NODE_ENV);
}

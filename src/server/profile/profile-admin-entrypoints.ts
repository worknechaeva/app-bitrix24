import "server-only";

import { z } from "zod";
import { getLiveApplicationSessionAuthority } from "@/server/auth/application-session";
import { ProfileAdminService } from "./profile-admin-service";
import { createSupabaseProfileLifecycleRepository } from "./supabase-profile-lifecycle-repository";

const roleChangeSchema = z
  .object({
    targetProfileId: z.uuid(),
    role: z.enum(["editor", "administrator"]),
  })
  .strict();

const blockSchema = z.object({ targetProfileId: z.uuid() }).strict();

export type ProfileAdminEntrypointResult =
  | { status: "success"; outcome: string }
  | { status: "error"; reason: "invalid_input" | "unauthorized" | "rejected" | "storage_failure" };

function createProfileAdminService(): ProfileAdminService {
  return new ProfileAdminService(
    getLiveApplicationSessionAuthority,
    createSupabaseProfileLifecycleRepository(),
  );
}

export async function changeProfileRoleForCurrentSession(
  input: unknown,
): Promise<ProfileAdminEntrypointResult> {
  const parsed = roleChangeSchema.safeParse(input);
  if (!parsed.success) return { status: "error", reason: "invalid_input" };

  try {
    const result = await createProfileAdminService().changeRole(parsed.data);
    if (result.outcome === "unauthorized") return { status: "error", reason: "unauthorized" };
    if (["target_unknown", "target_inactive", "last_administrator"].includes(result.outcome)) {
      return { status: "error", reason: "rejected" };
    }
    return { status: "success", outcome: result.outcome };
  } catch {
    return { status: "error", reason: "storage_failure" };
  }
}

export async function blockProfileForCurrentSession(input: unknown): Promise<ProfileAdminEntrypointResult> {
  const parsed = blockSchema.safeParse(input);
  if (!parsed.success) return { status: "error", reason: "invalid_input" };

  try {
    const result = await createProfileAdminService().block(parsed.data);
    if (result.outcome === "unauthorized") return { status: "error", reason: "unauthorized" };
    if (["target_unknown", "last_administrator"].includes(result.outcome)) {
      return { status: "error", reason: "rejected" };
    }
    return { status: "success", outcome: result.outcome };
  } catch {
    return { status: "error", reason: "storage_failure" };
  }
}

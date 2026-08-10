import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AppSessionActor } from "./app-session-repository";
import { AppSessionService } from "./app-session-service";
import { getMockSession, MOCK_SESSION_COOKIE_NAME } from "./mock-session";
import { getApplicationRuntimeMode } from "./runtime-mode";
import { APPLICATION_SESSION_COOKIE_NAME, expiredApplicationSessionCookieOptions } from "./session-cookie";
import { createSupabaseAppSessionRepository } from "./supabase-app-session-repository";

export type ApplicationRole = "administrator" | "editor";

export type ApplicationSession = {
  mode: "mock" | "live";
  name: string;
  role: ApplicationRole;
  profileId?: string;
  portalInstallationId?: number;
  expiresAt?: string;
};

function mapLiveActor(actor: AppSessionActor): ApplicationSession {
  return {
    mode: "live",
    name: "Пользователь Bitrix24",
    role: actor.role,
    profileId: actor.profileId,
    portalInstallationId: actor.portalInstallationId,
    expiresAt: actor.expiresAt,
  };
}

export async function getApplicationSession(): Promise<ApplicationSession | null> {
  if (getApplicationRuntimeMode() === "mock") {
    const mock = await getMockSession();
    return mock
      ? { mode: "mock", name: mock.name, role: mock.role === "admin" ? "administrator" : "editor" }
      : null;
  }

  const token = (await cookies()).get(APPLICATION_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const result = await new AppSessionService(createSupabaseAppSessionRepository()).resolve(token);
    return result.outcome === "active" ? mapLiveActor(result.actor) : null;
  } catch {
    return null;
  }
}

export async function requireApplicationSession(): Promise<ApplicationSession> {
  const session = await getApplicationSession();
  if (!session) redirect("/login");
  return session;
}

export async function logoutApplicationSession(): Promise<never> {
  "use server";

  const cookieStore = await cookies();
  if (getApplicationRuntimeMode() === "mock") {
    cookieStore.delete(MOCK_SESSION_COOKIE_NAME);
    redirect("/login");
  }

  const token = cookieStore.get(APPLICATION_SESSION_COOKIE_NAME)?.value;
  try {
    if (token) await new AppSessionService(createSupabaseAppSessionRepository()).revoke(token);
  } catch {
    // Browser logout remains fail closed: the opaque cookie is cleared even if storage is unavailable.
  } finally {
    cookieStore.set(APPLICATION_SESSION_COOKIE_NAME, "", expiredApplicationSessionCookieOptions());
  }
  redirect("/login");
}

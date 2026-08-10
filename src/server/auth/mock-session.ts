import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MOCK_USERS } from "@/server/fixtures";
import { getApplicationRuntimeMode } from "./runtime-mode";

export const MOCK_SESSION_COOKIE_NAME = "task-launcher-mock-role";
export type MockRole = "admin" | "editor";

function assertDevelopmentMode() {
  if (process.env.NODE_ENV === "production" || getApplicationRuntimeMode() !== "mock") {
    throw new Error("Mock authentication is disabled in production");
  }
}

export async function getMockSession() {
  if (process.env.NODE_ENV === "production" || getApplicationRuntimeMode() !== "mock") return null;
  const role = (await cookies()).get(MOCK_SESSION_COOKIE_NAME)?.value as MockRole | undefined;
  if (role !== "admin" && role !== "editor") return null;
  const user = MOCK_USERS.find((candidate) => candidate.role === role);
  return user ? { ...user, role } : null;
}

export async function requireMockSession() {
  const session = await getMockSession();
  if (!session) redirect("/login");
  return session;
}

export async function loginAsMock(formData: FormData) {
  "use server";
  assertDevelopmentMode();
  const role = formData.get("role");
  if (role !== "admin" && role !== "editor") redirect("/login");
  (await cookies()).set(MOCK_SESSION_COOKIE_NAME, role, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  redirect("/tasks/new");
}

export async function logoutMock() {
  "use server";
  (await cookies()).delete(MOCK_SESSION_COOKIE_NAME);
  redirect("/login");
}

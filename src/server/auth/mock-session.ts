import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MOCK_USERS } from "@/server/fixtures";

const COOKIE_NAME = "task-launcher-mock-role";
export type MockRole = "admin" | "editor";

function assertDevelopmentMode() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Mock authentication is disabled in production");
  }
}

export async function getMockSession() {
  if (process.env.NODE_ENV === "production") return null;
  const role = (await cookies()).get(COOKIE_NAME)?.value as MockRole | undefined;
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
  (await cookies()).set(COOKIE_NAME, role, {
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
  (await cookies()).delete(COOKIE_NAME);
  redirect("/login");
}

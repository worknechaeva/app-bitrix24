import "server-only";

export const APPLICATION_SESSION_COOKIE_NAME = "__Host-task-launcher-session";

export function readApplicationSessionCookie(request: Request): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  const values = header
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${APPLICATION_SESSION_COOKIE_NAME}=`))
    .map((part) => part.slice(APPLICATION_SESSION_COOKIE_NAME.length + 1));
  return values.length === 1 && values[0] !== "" ? values[0] : undefined;
}

export function serializeApplicationSessionCookie(token: string, expiresAt: string): string {
  return `${APPLICATION_SESSION_COOKIE_NAME}=${token}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; Secure; SameSite=Lax`;
}

export function applicationSessionCookieOptions(expiresAt: string) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
  };
}

export function expiredApplicationSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(0),
  };
}

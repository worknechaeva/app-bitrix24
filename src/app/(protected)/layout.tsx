import { AppShell } from "@/components/app-shell/app-shell";
import { requireMockSession } from "@/server/auth/mock-session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireMockSession();
  return <AppShell user={user}>{children}</AppShell>;
}

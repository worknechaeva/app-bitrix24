import { AppShell } from "@/components/app-shell/app-shell";
import { requireApplicationSession } from "@/server/auth/application-session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireApplicationSession();
  return <AppShell user={user}>{children}</AppShell>;
}

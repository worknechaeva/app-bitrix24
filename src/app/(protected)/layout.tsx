import { AppShell } from "@/components/app-shell/app-shell";
import { LiveAuthPlaceholder } from "@/components/app-shell/live-auth-placeholder";
import { requireApplicationSession } from "@/server/auth/application-session";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireApplicationSession();
  return <AppShell user={user}>{user.mode === "live" ? <LiveAuthPlaceholder /> : children}</AppShell>;
}

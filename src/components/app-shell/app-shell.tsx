import Link from "next/link";
import { LogOut, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DesktopNavigation, MobileNavigation } from "./navigation";
import { logoutMock } from "@/server/auth/mock-session";

type AppShellProps = {
  user: { name: string; role: "admin" | "editor" };
  children: React.ReactNode;
};

export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="bg-muted/40 min-h-svh">
      <aside className="border-border bg-background fixed inset-y-0 left-0 hidden w-64 border-r p-5 md:flex md:flex-col">
        <Link href="/" className="mb-8 flex items-center gap-3" aria-label="Task Launcher — главная">
          <span className="bg-primary text-primary-foreground grid size-10 place-items-center rounded-2xl">
            <Rocket className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold">Task Launcher</span>
            <span className="text-muted-foreground block text-xs">Bitrix24 без лишнего</span>
          </span>
        </Link>
        <DesktopNavigation />
        <div className="mt-auto space-y-3">
          <div className="bg-muted rounded-2xl p-3">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <Badge variant="outline" className="mt-1">
              {user.role === "admin" ? "Администратор" : "Редактор"}
            </Badge>
          </div>
          <form action={logoutMock}>
            <Button variant="ghost" className="w-full justify-start" type="submit">
              <LogOut aria-hidden="true" className="size-4" />
              Выйти
            </Button>
          </form>
        </div>
      </aside>

      <header className="border-border bg-background/95 sticky top-0 z-30 flex min-h-16 items-center justify-between border-b px-4 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground grid size-9 place-items-center rounded-xl">
            <Rocket className="size-4" aria-hidden="true" />
          </span>
          Task Launcher
        </Link>
        <Badge variant="secondary">{user.role === "admin" ? "Админ" : "Редактор"}</Badge>
      </header>

      <main className="mx-auto min-h-svh max-w-6xl px-4 py-6 pb-24 md:ml-64 md:px-8 md:py-10 md:pb-10">
        {children}
      </main>
      <MobileNavigation />
    </div>
  );
}

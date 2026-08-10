import Link from "next/link";
import { ArrowRight, LockKeyhole, Rocket, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAsMock } from "@/server/auth/mock-session";
import { getApplicationRuntimeMode } from "@/server/auth/runtime-mode";

export default function LoginPage() {
  const mockAvailable = getApplicationRuntimeMode() === "mock";
  return (
    <main className="bg-muted/50 grid min-h-svh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <span className="bg-primary text-primary-foreground grid size-14 place-items-center rounded-2xl shadow-sm">
            <Rocket className="size-7" />
          </span>
        </div>
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Вход в Task Launcher</CardTitle>
            <CardDescription>
              {mockAvailable
                ? "Первый milestone работает без внешних аккаунтов и секретов."
                : "Вход через корпоративный портал Bitrix24."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {mockAvailable ? (
              <>
                <form action={loginAsMock}>
                  <input type="hidden" name="role" value="admin" />
                  <Button
                    data-testid="login-admin"
                    type="submit"
                    size="lg"
                    className="min-h-12 w-full justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="size-5" /> Войти как администратор
                    </span>
                    <ArrowRight className="size-4" />
                  </Button>
                </form>
                <form action={loginAsMock}>
                  <input type="hidden" name="role" value="editor" />
                  <Button
                    data-testid="login-editor"
                    type="submit"
                    size="lg"
                    variant="outline"
                    className="min-h-12 w-full justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <LockKeyhole className="size-5" /> Войти как редактор
                    </span>
                    <ArrowRight className="size-4" />
                  </Button>
                </form>
                <p className="text-muted-foreground text-center text-xs">
                  Mock-вход доступен только в development.
                </p>
              </>
            ) : (
              <Button asChild size="lg" className="min-h-12 w-full justify-between">
                <Link href="/api/bitrix24/oauth/start">
                  <span className="flex items-center gap-2">
                    <LockKeyhole className="size-5" /> Войти через Bitrix24
                  </span>
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

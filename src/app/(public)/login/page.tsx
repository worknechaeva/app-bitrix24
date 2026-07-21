import { ArrowRight, LockKeyhole, Rocket, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAsMock } from "@/server/auth/mock-session";

export default function LoginPage() {
  const mockAvailable = process.env.NODE_ENV !== "production";
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
            <CardDescription>Первый milestone работает без внешних аккаунтов и секретов.</CardDescription>
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
              <Alert>
                <LockKeyhole className="size-4" />
                <AlertTitle>Авторизация не настроена</AlertTitle>
                <AlertDescription>Подключите Supabase Auth перед production-запуском.</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

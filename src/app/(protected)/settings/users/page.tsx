import { ShieldCheck, UserRound } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MOCK_USERS } from "@/server/fixtures";
import { requireMockSession } from "@/server/auth/mock-session";

export default async function UsersSettingsPage() {
  const session = await requireMockSession();
  return (
    <>
      <PageHeading
        title="Пользователи приложения"
        description="Создание реальных учетных записей появится после подключения Supabase."
        action={<Button disabled>Добавить пользователя</Button>}
      />
      {session.role !== "admin" ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <ShieldCheck className="text-muted-foreground size-5" />
            <p>Управление пользователями доступно только администратору.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {MOCK_USERS.map((user) => (
            <Card key={user.id} className="shadow-sm">
              <CardContent className="flex items-center gap-4 p-4">
                <span className="bg-muted grid size-11 place-items-center rounded-full">
                  <UserRound className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{user.name}</p>
                  <p className="text-muted-foreground truncate text-sm">{user.email}</p>
                </div>
                <Badge variant="secondary">{user.role === "admin" ? "Администратор" : "Редактор"}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

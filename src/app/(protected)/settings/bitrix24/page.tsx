import Link from "next/link";
import { CheckCircle2, RefreshCw, Server, Users } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MockBitrix24Client } from "@/integrations/bitrix24/mock-client";

export const dynamic = "force-dynamic";

export default async function BitrixSettingsPage() {
  const client = new MockBitrix24Client();
  const [connection, user, employees, workgroups] = await Promise.all([
    client.checkConnection(),
    client.getCurrentUser(),
    client.listEmployees(),
    client.listWorkgroups(),
  ]);
  return (
    <>
      <PageHeading
        title="Подключение к Bitrix24"
        description="На первом milestone используется server-only mock-клиент. Настоящий webhook не требуется."
      />
      <Alert className="mb-5 border-emerald-200 bg-emerald-50 text-emerald-950">
        <CheckCircle2 className="size-4" />
        <AlertTitle>Соединение работает</AlertTitle>
        <AlertDescription>{connection.accountName} · проверено сейчас</AlertDescription>
      </Alert>
      <div className="grid gap-5 md:grid-cols-3">
        <Card>
          <CardHeader>
            <Server className="text-muted-foreground size-5" />
            <CardTitle className="text-base">Пользователь webhook</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{user.name}</p>
            <Badge className="mt-2" variant="secondary">
              Mock
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Users className="text-muted-foreground size-5" />
            <CardTitle className="text-base">Сотрудники</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{employees.length}</p>
            <p className="text-muted-foreground text-sm">доступно в справочнике</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <RefreshCw className="text-muted-foreground size-5" />
            <CardTitle className="text-base">Рабочие группы</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{workgroups.length}</p>
            <p className="text-muted-foreground text-sm">{workgroups[0]?.name}</p>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button disabled>
          <RefreshCw className="size-4" /> Синхронизировать
        </Button>
        <Button asChild variant="outline">
          <Link href="/settings/users">Пользователи приложения</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/install">Установить PWA</Link>
        </Button>
      </div>
    </>
  );
}

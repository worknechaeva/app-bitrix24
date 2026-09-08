import { PageHeading } from "@/components/page-heading";
import { TaskForm } from "@/features/tasks/task-form";
import { EMPLOYEES } from "@/server/fixtures";
import { getProjectRepository } from "@/server/repositories/mock-project-repository";
import { requireApplicationSession } from "@/server/auth/application-session";
import { LiveAuthPlaceholder } from "@/components/app-shell/live-auth-placeholder";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const session = await requireApplicationSession();
  if (session.mode === "live") return <LiveAuthPlaceholder />;
  const projects = (
    await getProjectRepository().listVisible({
      profileId: session.role === "administrator" ? "mock-admin" : "mock-editor",
      role: session.role,
    })
  ).filter((project) => !project.archived);
  const requestedProjectId = (await searchParams).projectId;
  const initialProjectId = projects.some((project) => project.id === requestedProjectId)
    ? requestedProjectId
    : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="Новая задача"
        description="Обязательных полей всего два. Остальное можно уточнить при необходимости."
      />
      <TaskForm
        projects={projects}
        employees={EMPLOYEES}
        idempotencyKey={crypto.randomUUID()}
        initialProjectId={initialProjectId}
        showMockControls={process.env.NODE_ENV !== "production"}
      />
    </div>
  );
}

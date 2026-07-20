import { PageHeading } from "@/components/page-heading";
import { TaskForm } from "@/features/tasks/task-form";
import { EMPLOYEES } from "@/server/fixtures";
import { getProjectRepository } from "@/server/repositories/mock-project-repository";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const projects = await getProjectRepository().listActive();
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

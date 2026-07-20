import { PageHeading } from "@/components/page-heading";
import { TaskForm } from "@/features/tasks/task-form";
import { EMPLOYEES, PROJECTS } from "@/server/fixtures";

export const dynamic = "force-dynamic";

export default function NewTaskPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeading
        title="Новая задача"
        description="Обязательных полей всего два. Остальное можно уточнить при необходимости."
      />
      <TaskForm
        projects={PROJECTS.filter((project) => project.active)}
        employees={EMPLOYEES}
        idempotencyKey={crypto.randomUUID()}
        showMockControls={process.env.NODE_ENV !== "production"}
      />
    </div>
  );
}

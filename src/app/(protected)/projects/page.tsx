import { PageHeading } from "@/components/page-heading";
import { ProjectManagement } from "@/features/projects/project-management";
import { requireMockSession } from "@/server/auth/mock-session";
import { EMPLOYEES } from "@/server/fixtures";
import { getProjectRepository } from "@/server/repositories/mock-project-repository";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const session = await requireMockSession();
  const repository = getProjectRepository();
  const projects = session.role === "admin" ? await repository.listAll() : await repository.listActive();
  return (
    <>
      <PageHeading
        title="Проекты"
        description="Настройки подставляются в задачу автоматически. Изменения mock-справочника сбрасываются после перезапуска сервера."
      />
      <ProjectManagement
        initialProjects={projects}
        employees={EMPLOYEES}
        canManage={session.role === "admin"}
      />
    </>
  );
}

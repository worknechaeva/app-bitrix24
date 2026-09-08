import { PageHeading } from "@/components/page-heading";
import { ProjectManagement } from "@/features/projects/project-management";
import { loadProjectPageData } from "@/features/projects/actions";
export const dynamic = "force-dynamic";
export default async function ProjectsPage() {
  const data = await loadProjectPageData();
  if (!data) return null;
  return (
    <>
      <PageHeading
        title="Проекты"
        description="Ваши настройки быстрого создания задач. Архивирование не меняет проект в Bitrix24."
      />
      <ProjectManagement
        initialProjects={data.projects}
        entities={data.entities}
        employees={data.employees}
        actorProfileId={data.actorProfileId}
        directoryStatus={data.directoryStatus}
      />
    </>
  );
}

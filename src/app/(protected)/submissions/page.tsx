import { PageHeading } from "@/components/page-heading";
import { SubmissionHistory } from "@/features/submissions/submission-history";
import { listSubmissions } from "@/server/services/create-task";
import { getProjectRepository } from "@/server/repositories/mock-project-repository";
import { requireApplicationSession } from "@/server/auth/application-session";
import { LiveAuthPlaceholder } from "@/components/app-shell/live-auth-placeholder";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage() {
  const session = await requireApplicationSession();
  if (session.mode === "live") return <LiveAuthPlaceholder />;
  const actor = { profileId: session.profileId, role: session.role };
  const submissions = listSubmissions(actor);
  const projects = (await getProjectRepository().listVisible(actor)).filter((project) => !project.archived);
  return (
    <>
      <PageHeading
        title="История создания"
        description="В mock-режиме новые записи хранятся только до перезапуска сервера."
      />
      <SubmissionHistory submissions={submissions} projects={projects} />
    </>
  );
}

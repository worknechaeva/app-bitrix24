import { PageHeading } from "@/components/page-heading";
import { SubmissionHistory } from "@/features/submissions/submission-history";
import { listSubmissions } from "@/server/services/create-task";
import { getProjectRepository } from "@/server/repositories/mock-project-repository";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage() {
  const submissions = listSubmissions();
  const projects = await getProjectRepository().listActive();
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

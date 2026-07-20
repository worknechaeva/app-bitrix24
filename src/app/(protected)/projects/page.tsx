import { Clock3, ExternalLink, Tag, Users } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PROJECTS, getEmployeeName } from "@/server/fixtures";

export default function ProjectsPage() {
  return (
    <>
      <PageHeading
        title="Проекты"
        description="Mock-справочник показывает настройки, которые будут подставлены в задачу автоматически."
      />
      <div className="grid gap-5 lg:grid-cols-2">
        {PROJECTS.map((project) => (
          <Card key={project.id} className={project.active ? "shadow-sm" : "opacity-60"}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription className="mt-1">{project.websiteUrl}</CardDescription>
                </div>
                <Badge variant={project.active ? "secondary" : "outline"}>
                  {project.active ? "Активен" : "Отключен"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                <Tag className="text-muted-foreground size-4" /> {project.requiredTag}
              </p>
              <p className="flex items-center gap-2">
                <Users className="text-muted-foreground size-4" />{" "}
                {getEmployeeName(project.defaultResponsibleId)}
              </p>
              <p className="flex items-center gap-2">
                <Clock3 className="text-muted-foreground size-4" /> Учет времени{" "}
                {project.timeTrackingEnabled ? "включен" : "выключен"}
              </p>
              <a
                href={project.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary inline-flex min-h-11 items-center gap-2 font-medium"
              >
                Открыть сайт <ExternalLink className="size-4" />
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

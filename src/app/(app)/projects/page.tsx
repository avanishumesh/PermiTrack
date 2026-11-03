import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Files, FolderKanban, Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireActiveViewer } from "@/lib/auth";
import { listProjects } from "@/lib/services/projects";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  await requireActiveViewer();
  const projects = await listProjects();

  return (
    <>
      <PageHeader
        eyebrow="Projects"
        title="Research & lab projects"
        description="Every permission request belongs to a project. Projects define the team, the faculty guide and the department that routes approvals."
        actions={
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="h-4 w-4" /> New project
            </Link>
          </Button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project to group your team, faculty guide and permission requests."
          icon={<FolderKanban className="h-6 w-6" />}
          action={
            <Button asChild>
              <Link href="/projects/new">Create a project</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="gap-2 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      <Link href={`/projects/${project.id}`} className="hover:underline">
                        {project.title}
                      </Link>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {project.department_name}
                      {project.category ? ` · ${project.category}` : ""}
                    </p>
                  </div>
                  <Badge variant={project.status === "ACTIVE" ? "success" : "muted"}>
                    {project.status.charAt(0) + project.status.slice(1).toLowerCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted-foreground">
                  {project.description || "No description provided."}
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border bg-muted/30 p-2.5">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> Team
                    </p>
                    <p className="mt-1 font-medium">{project.member_count} member(s)</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-2.5">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Files className="h-3.5 w-3.5" /> Requests
                    </p>
                    <p className="mt-1 font-medium">{project.request_count}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span>Guide: {project.faculty_guide_name ?? "Not assigned"}</span>
                  <Link
                    href={`/projects/${project.id}`}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Open <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <p className="text-[11px] text-muted-foreground">Updated {formatDate(project.updated_at)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

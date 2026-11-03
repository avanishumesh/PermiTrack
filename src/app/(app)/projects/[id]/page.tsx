import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FilePlus2, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RequestsTable } from "@/components/requests-table";
import { ProjectMembers } from "@/components/projects/project-members";
import { ProjectForm } from "@/components/projects/project-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireActiveViewer } from "@/lib/auth";
import { canManageProject } from "@/lib/permissions";
import { getProjectDetail, listDepartments, listFacultyGuides, searchPeople } from "@/lib/services/projects";
import { listProjectRequests } from "@/lib/services/requests";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireActiveViewer();
  const detail = await getProjectDetail(id);
  if (!detail) notFound();

  const project = detail.project as {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    status: string;
    department_id: string;
    department_name?: string;
    created_by: string;
    faculty_guide_id: string | null;
    created_at: string;
    updated_at: string;
    departments?: { name: string } | null;
    owner?: { name: string; email: string } | null;
    guide?: { name: string; email: string } | null;
  };

  const manage = canManageProject(viewer, project);
  const [requests, departments, guides, people] = await Promise.all([
    listProjectRequests(id),
    manage ? listDepartments() : Promise.resolve([]),
    manage ? listFacultyGuides() : Promise.resolve([]),
    manage ? searchPeople() : Promise.resolve([]),
  ]);

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/projects">
            <ArrowLeft className="h-4 w-4" /> Projects
          </Link>
        </Button>
      </div>

      <PageHeader
        eyebrow="Project"
        title={project.title}
        description={
          project.description ||
          "No description yet. Add context so approvers understand what the project needs."
        }
        actions={
          <>
            {manage ? (
              <Button asChild variant="outline">
                <Link href={`/requests/new?projectId=${project.id}`}>
                  <FilePlus2 className="h-4 w-4" /> New request
                </Link>
              </Button>
            ) : null}
            <Badge variant={project.status === "ACTIVE" ? "success" : "muted"}>
              {project.status.charAt(0) + project.status.slice(1).toLowerCase()}
            </Badge>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Department", value: project.departments?.name ?? "—" },
          { label: "Faculty guide", value: project.guide?.name ?? "Not assigned" },
          { label: "Owner", value: project.owner?.name ?? "—" },
          { label: "Category", value: project.category ?? "—" },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</p>
              <p className="mt-1 truncate text-sm font-medium">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Permission requests</CardTitle>
            <CardDescription>Requests belonging to this project.</CardDescription>
          </div>
          {manage ? (
            <Button asChild size="sm">
              <Link href={`/requests/new?projectId=${project.id}`}>
                <FilePlus2 className="h-4 w-4" /> New
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <RequestsTable
            rows={requests}
            emptyMessage="No permission requests for this project yet."
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
            <CardDescription>
              Owners and editors can edit drafts, upload documents and resubmit requests.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProjectMembers
              projectId={project.id}
              members={detail.members}
              candidates={people}
              canManage={manage}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Project facts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-3 border-b pb-2">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(project.created_at)}</span>
              </div>
              <div className="flex justify-between gap-3 border-b pb-2">
                <span className="text-muted-foreground">Updated</span>
                <span>{formatDate(project.updated_at)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Requests</span>
                <span>{requests.length}</span>
              </div>
            </CardContent>
          </Card>

          {manage ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" /> Edit project
                </CardTitle>
                <CardDescription>
                  Department changes are blocked by the API once requests exist.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProjectForm
                  mode="edit"
                  departments={departments}
                  guides={guides}
                  project={{
                    id: project.id,
                    title: project.title,
                    description: project.description,
                    category: project.category,
                    department_id: project.department_id,
                    faculty_guide_id: project.faculty_guide_id,
                  }}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

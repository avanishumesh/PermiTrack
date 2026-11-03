import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ProjectForm } from "@/components/projects/project-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireActiveViewer } from "@/lib/auth";
import { listDepartments, listFacultyGuides } from "@/lib/services/projects";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const viewer = await requireActiveViewer();
  const [departments, guides] = await Promise.all([listDepartments(), listFacultyGuides()]);

  const preferredDepartment = viewer.profile.department_id ?? departments[0]?.id ?? "";

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
        eyebrow="New project"
        title="Create a project"
        description="Projects group a team and a faculty guide. Permission requests inherit the project's department for approver routing."
      />

      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
          <CardDescription>
            You become the owner. Add team members and a faculty guide after creating the project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectForm
            mode="create"
            departments={departments}
            guides={guides}
            project={
              preferredDepartment
                ? {
                    id: "",
                    title: "",
                    description: null,
                    category: null,
                    department_id: preferredDepartment,
                    faculty_guide_id: null,
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { DepartmentsManager } from "@/components/admin/departments-manager";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminViewer } from "@/lib/auth";
import { listDepartments } from "@/lib/services/admin";
import { searchPeople } from "@/lib/services/projects";

export const metadata: Metadata = { title: "Departments" };

export default async function AdminDepartmentsPage() {
  await requireAdminViewer();
  const [departments, people] = await Promise.all([listDepartments(), searchPeople().catch(() => [])]);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Departments"
        description="Departments define the routing hierarchy. Workflow stages can resolve to the project's department, its parent, or the root department."
      />
      <Card>
        <CardContent className="p-4">
          <DepartmentsManager departments={departments} people={people} />
        </CardContent>
      </Card>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { PermissionTypeEditor } from "@/components/admin/permission-type-editor";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminViewer } from "@/lib/auth";
import { listDepartments } from "@/lib/services/admin";

export const metadata: Metadata = { title: "New permission type" };

export default async function NewPermissionTypePage() {
  await requireAdminViewer();
  const departments = await listDepartments();

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/admin/permission-types">
            <ArrowLeft className="h-4 w-4" /> Permission types
          </Link>
        </Button>
      </div>

      <PageHeader
        eyebrow="Administration"
        title="New permission type"
        description="Define the dynamic form first. After saving you can add required documents and build its workflow."
      />

      <Alert variant="info" title="Save before adding workflow">
        <p>
          A permission type needs an active, published workflow before students can submit requests.
          You will be able to create one right after saving.
        </p>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Definition</CardTitle>
          <CardDescription>
            Field keys must be lower_snake_case and are permanent — requests store values against
            them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionTypeEditor departments={departments} />
        </CardContent>
      </Card>
    </>
  );
}

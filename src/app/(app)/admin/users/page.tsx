import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { UsersManager } from "@/components/admin/users-manager";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdminViewer } from "@/lib/auth";
import { listDepartments, listRoles, listUsers } from "@/lib/services/admin";

export const metadata: Metadata = { title: "Users & roles" };

export default async function AdminUsersPage() {
  await requireAdminViewer();
  const [users, roles, departments] = await Promise.all([
    listUsers(),
    listRoles(),
    listDepartments(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users & roles"
        description="Activate accounts and assign the roles that route approval authority. Role scope determines which department's requests a person can act on."
      />
      <Card>
        <CardContent className="p-4">
          <UsersManager users={users} roles={roles} departments={departments} />
        </CardContent>
      </Card>
    </>
  );
}

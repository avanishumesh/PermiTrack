"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Plus, Settings2, ShieldCheck, UserCog } from "lucide-react";
import { createUserAction, setUserRolesAction, updateUserAction } from "@/app/actions/admin";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminUser } from "@/lib/services/admin";
import type { ActionState } from "@/lib/errors";
import { formatDate, initials } from "@/lib/utils";

const initialState: ActionState = { ok: false };

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface RoleOption {
  id: string;
  name: string;
  description: string | null;
}

interface DepartmentOption {
  id: string;
  name: string;
}

function RolePicker({
  roles,
  departments,
  defaultDepartmentId,
  initial,
}: {
  roles: RoleOption[];
  departments: DepartmentOption[];
  defaultDepartmentId?: string | null;
  initial?: Array<{ roleId: string; departmentId: string | null }>;
}) {
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const assignment of initial ?? []) {
      map[assignment.roleId] = assignment.departmentId ?? "";
    }
    return map;
  });

  const payload = Object.entries(selected).map(([roleId, departmentId]) => ({
    roleId,
    departmentId: departmentId || null,
  }));

  return (
    <div className="space-y-2">
      <input type="hidden" name="roles" value={JSON.stringify(payload)} />
      <Label>Roles</Label>
      <div className="space-y-1.5">
        {roles.map((role) => {
          const checked = role.id in selected;
          return (
            <div key={role.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <input
                type="checkbox"
                id={`role-${role.id}`}
                checked={checked}
                onChange={(event) =>
                  setSelected((current) => {
                    const next = { ...current };
                    if (event.target.checked) {
                      next[role.id] = defaultDepartmentId ?? "";
                    } else {
                      delete next[role.id];
                    }
                    return next;
                  })
                }
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor={`role-${role.id}`} className="flex-1 text-sm">
                <span className="font-medium">{role.name.replace(/_/g, " ")}</span>
                {role.description ? (
                  <span className="block text-xs text-muted-foreground">{role.description}</span>
                ) : null}
              </label>
              {checked ? (
                <select
                  aria-label={`Department scope for ${role.name}`}
                  value={selected[role.id]}
                  onChange={(event) =>
                    setSelected((current) => ({ ...current, [role.id]: event.target.value }))
                  }
                  className="h-8 rounded-md border border-input bg-card px-2 text-xs"
                >
                  <option value="">University-wide</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewUserDialog({
  roles,
  departments,
}: {
  roles: RoleOption[];
  departments: DepartmentOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [state, formAction] = useActionState(createUserAction, initialState);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
      if (state.message?.startsWith("User created.") && state.message.includes("Temporary password")) {
        // Keep the dialog open so the administrator can copy the password.
      } else {
        setOpen(false);
      }
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> New user
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a user</DialogTitle>
          <DialogDescription>
            Accounts are created with a confirmed email. Leave the password blank to generate a
            temporary one.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <FormMessage state={state} />
          <div className="space-y-1.5">
            <Label htmlFor="new-name">Full name</Label>
            <Input id="new-name" name="name" required maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-email">University email</Label>
            <Input id="new-email" name="email" type="email" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Temporary password (optional)</Label>
            <Input id="new-password" name="password" type="text" minLength={8} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-department">Department</Label>
            <select
              id="new-department"
              name="departmentId"
              className={selectClass}
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              <option value="">No department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <RolePicker roles={roles} departments={departments} defaultDepartmentId={departmentId} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Creating…">Create user</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  departments,
}: {
  user: AdminUser;
  departments: DepartmentOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(updateUserAction, initialState);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <UserCog className="h-4 w-4" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {user.name}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={user.id} />
          <FormMessage state={state} />
          <div className="space-y-1.5">
            <Label htmlFor={`name-${user.id}`}>Full name</Label>
            <Input id={`name-${user.id}`} name="name" defaultValue={user.name} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`dept-${user.id}`}>Department</Label>
            <select
              id={`dept-${user.id}`}
              name="departmentId"
              defaultValue={user.department_id ?? ""}
              className={selectClass}
            >
              <option value="">No department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={user.is_active}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="font-medium">Account active</span>
              <span className="block text-xs text-muted-foreground">
                Inactive users cannot sign in or act on approvals.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RolesDialog({
  user,
  roles,
  departments,
}: {
  user: AdminUser;
  roles: RoleOption[];
  departments: DepartmentOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(setUserRolesAction, initialState);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <ShieldCheck className="h-4 w-4" /> Roles
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Roles for {user.name}</DialogTitle>
          <DialogDescription>
            Role assignments can be scoped to a department. The last administrator cannot be removed.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="userId" value={user.id} />
          <FormMessage state={state} />
          <RolePicker
            roles={roles}
            departments={departments}
            defaultDepartmentId={user.department_id}
            initial={user.roles.map((role) => ({
              roleId: role.role_id,
              departmentId: role.department_id,
            }))}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save roles</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersManager({
  users,
  roles,
  departments,
}: {
  users: AdminUser[];
  roles: RoleOption[];
  departments: DepartmentOption[];
}) {
  const [query, setQuery] = useState("");
  const filtered = users.filter((user) => {
    if (!query.trim()) return true;
    const needle = query.toLowerCase();
    return (
      user.name.toLowerCase().includes(needle) ||
      user.email.toLowerCase().includes(needle) ||
      (user.department_name ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, email or department"
          className="max-w-sm"
        />
        <NewUserDialog roles={roles} departments={departments} />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {initials(user.name, user.email)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {user.department_name ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.roles.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Student</span>
                    ) : (
                      user.roles.map((role) => (
                        <Badge key={role.id} variant="outline">
                          {role.role_name.replace(/_/g, " ")}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? "success" : "danger"}>
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(user.created_at)}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <RolesDialog user={user} roles={roles} departments={departments} />
                    <EditUserDialog user={user} departments={departments} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No users match that search.</p>
        ) : null}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Settings2 className="h-3.5 w-3.5" /> Roles control routing and authority. Assign staff roles
        through the Roles dialog; students need no role.
      </p>
    </div>
  );
}

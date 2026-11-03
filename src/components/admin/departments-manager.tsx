"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Building2, Pencil, Plus } from "lucide-react";
import { saveDepartmentAction } from "@/app/actions/admin";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
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
import type { Department } from "@/lib/types";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function DepartmentDialog({
  department,
  departments,
  people,
  trigger,
}: {
  department?: Department;
  departments: Department[];
  people: Array<{ id: string; name: string; email: string }>;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(saveDepartmentAction, initialState);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? `Edit ${department.name}` : "New department"}</DialogTitle>
          <DialogDescription>
            Departments form a hierarchy. Parent links let workflows route to a parent head.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          {department ? <input type="hidden" name="id" value={department.id} /> : null}
          <FormMessage state={state} />
          <div className="space-y-1.5">
            <Label htmlFor={`dept-name-${department?.id ?? "new"}`}>Name</Label>
            <Input
              id={`dept-name-${department?.id ?? "new"}`}
              name="name"
              defaultValue={department?.name}
              required
              maxLength={160}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`dept-parent-${department?.id ?? "new"}`}>Parent department</Label>
            <select
              id={`dept-parent-${department?.id ?? "new"}`}
              name="parentId"
              defaultValue={department?.parent_id ?? ""}
              className={selectClass}
            >
              <option value="">None (top level)</option>
              {departments
                .filter((candidate) => candidate.id !== department?.id)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`dept-head-${department?.id ?? "new"}`}>Department head</Label>
            <select
              id={`dept-head-${department?.id ?? "new"}`}
              name="headUserId"
              defaultValue={department?.head_user_id ?? ""}
              className={selectClass}
            >
              <option value="">Not assigned</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} — {person.email}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save department</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentsManager({
  departments,
  people,
}: {
  departments: Department[];
  people: Array<{ id: string; name: string; email: string }>;
}) {
  const byId = new Map(departments.map((department) => [department.id, department]));
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DepartmentDialog
          departments={departments}
          people={people}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" /> New department
            </Button>
          }
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Head</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {departments.map((department) => (
              <TableRow key={department.id}>
                <TableCell>
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {department.name}
                  </p>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {department.parent_id ? byId.get(department.parent_id)?.name ?? "—" : "Top level"}
                </TableCell>
                <TableCell className="text-sm">
                  {department.head_user_id
                    ? peopleById.get(department.head_user_id)?.name ?? "Assigned"
                    : "Not assigned"}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <DepartmentDialog
                      department={department}
                      departments={departments}
                      people={people}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                      }
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {departments.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No departments yet. Create the first one to start routing approvals.
          </p>
        ) : null}
      </div>
    </div>
  );
}

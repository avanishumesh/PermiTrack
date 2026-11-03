"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { ArrowRight, FilePlus2 } from "lucide-react";
import { createRequestAction } from "@/app/actions/requests";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function NewRequestForm({
  projects,
  permissionTypes,
  defaultProjectId,
}: {
  projects: Array<{ id: string; title: string; department_id: string }>;
  permissionTypes: Array<{
    id: string;
    name: string;
    description: string | null;
    department_id: string | null;
  }>;
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(createRequestAction, initialState);
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? "");

  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  const project = projects.find((candidate) => candidate.id === projectId) ?? null;

  const available = useMemo(() => {
    if (!project) return permissionTypes;
    return permissionTypes.filter(
      (type) => !type.department_id || type.department_id === project.department_id
    );
  }, [permissionTypes, project]);

  const [typeId, setTypeId] = useState("");
  const selectedType =
    available.find((type) => type.id === typeId) ?? (available.length === 1 ? available[0] : null);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="projectId">Project</Label>
        <select
          id="projectId"
          name="projectId"
          className={selectClass}
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setTypeId("");
          }}
          required
        >
          <option value="" disabled>
            Select a project
          </option>
          {projects.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
        {projects.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            You need a project first. Create one from the Projects page.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Approvers are routed using the project&apos;s department and faculty guide.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="permissionTypeId">Permission type</Label>
        <select
          id="permissionTypeId"
          name="permissionTypeId"
          className={selectClass}
          value={selectedType?.id ?? ""}
          onChange={(event) => setTypeId(event.target.value)}
          required
          disabled={!project}
        >
          <option value="" disabled>
            Select a permission type
          </option>
          {available.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        {project && available.length === 0 ? (
          <p className="text-xs text-rose-600">
            No permission types are configured for this project&apos;s department yet. Ask an
            administrator to add one.
          </p>
        ) : null}
      </div>

      {selectedType ? (
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-medium">{selectedType.name}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedType.description ??
              "You will complete the permission form on the next screen. You can save a draft and return later."}
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowRight className="h-3 w-3" /> The workflow version is pinned when the draft is
            created, so later workflow edits never affect this request.
          </p>
        </div>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Creating draft…" disabled={!project || !selectedType}>
          <FilePlus2 className="h-4 w-4" /> Create draft
        </SubmitButton>
      </div>
    </form>
  );
}

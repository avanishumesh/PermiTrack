"use client";

import { useActionState } from "react";
import { createProjectAction, updateProjectAction } from "@/app/actions/projects";
import { FieldError, FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Department } from "@/lib/types";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

export function ProjectForm({
  mode,
  departments,
  guides,
  project,
}: {
  mode: "create" | "edit";
  departments: Department[];
  guides: Array<{ id: string; name: string; department?: string | null }>;
  project?: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    department_id: string;
    faculty_guide_id: string | null;
  };
}) {
  const action = mode === "create" ? createProjectAction : updateProjectAction;
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {project ? <input type="hidden" name="projectId" value={project.id} /> : null}
      <FormMessage state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="title">Project title</Label>
        <Input
          id="title"
          name="title"
          defaultValue={project?.title}
          placeholder="Autonomous Robotics Capstone"
          maxLength={160}
          required
        />
        <FieldError errors={state.fieldErrors?.title} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="departmentId">Department</Label>
          {mode === "edit" ? (
            <input type="hidden" name="departmentId" value={project?.department_id ?? ""} />
          ) : null}
          <select
            id="departmentId"
            name="departmentId"
            defaultValue={project?.department_id ?? ""}
            className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            required
            disabled={mode === "edit"}
          >
            <option value="" disabled>
              Select a department
            </option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
          {mode === "edit" ? (
            <p className="text-xs text-muted-foreground">
              Department changes are not allowed once a project owns requests.
            </p>
          ) : null}
          <FieldError errors={state.fieldErrors?.departmentId} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            name="category"
            defaultValue={project?.category ?? ""}
            placeholder="Research, coursework, lab access…"
            maxLength={80}
          />
          <FieldError errors={state.fieldErrors?.category} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="facultyGuideId">Faculty guide</Label>
        <select
          id="facultyGuideId"
          name="facultyGuideId"
          defaultValue={project?.faculty_guide_id ?? ""}
          className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">No guide yet</option>
          {guides.map((guide) => (
            <option key={guide.id} value={guide.id}>
              {guide.name}
              {guide.department ? ` — ${guide.department}` : ""}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          The guide can become the first approver when a workflow routes to the project guide.
        </p>
        <FieldError errors={state.fieldErrors?.facultyGuideId} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={project?.description ?? ""}
          placeholder="What is the project, who is involved and what will it need?"
          maxLength={4000}
          rows={4}
        />
        <FieldError errors={state.fieldErrors?.description} />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <SubmitButton pendingLabel={mode === "create" ? "Creating…" : "Saving…"}>
          {mode === "create" ? "Create project" : "Save changes"}
        </SubmitButton>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { saveWorkflowAction } from "@/app/actions/admin";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APPROVER_TYPE_LABELS } from "@/lib/constants";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const APPROVER_TYPES = [
  "PROJECT_FACULTY_GUIDE",
  "DEPARTMENT_HEAD",
  "LAB_MANAGER",
  "DEAN",
  "ROLE",
  "USER",
  "CUSTOM",
] as const;

const SCOPES = [
  ["PROJECT_DEPARTMENT", "Project's department"],
  ["PARENT_DEPARTMENT", "Parent department"],
  ["ROOT_DEPARTMENT", "Root department"],
] as const;

interface StageDraft {
  name: string;
  approverType: string;
  approverRoleId: string;
  approverUserId: string;
  departmentScope: string;
  canEditFields: string[];
  invalidatesOn: string[];
  slaHours: string;
  conditionsText: string;
}

export interface WorkflowDraftInput {
  id?: string | null;
  name: string;
  stages: Array<{
    name: string;
    approverType: string;
    approverRoleId: string | null;
    approverUserId: string | null;
    departmentScope: string;
    canEditFields: string[];
    invalidatesOn: string[];
    slaHours: number | null;
    conditions: Record<string, unknown> | null;
  }>;
}

function toDraft(stage: WorkflowDraftInput["stages"][number]): StageDraft {
  return {
    name: stage.name,
    approverType: stage.approverType,
    approverRoleId: stage.approverRoleId ?? "",
    approverUserId: stage.approverUserId ?? "",
    departmentScope: stage.departmentScope,
    canEditFields: stage.canEditFields ?? [],
    invalidatesOn: stage.invalidatesOn ?? [],
    slaHours: stage.slaHours ? String(stage.slaHours) : "",
    conditionsText: stage.conditions ? JSON.stringify(stage.conditions) : "",
  };
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function WorkflowEditor({
  permissionTypeId,
  fieldOptions,
  roles,
  people,
  workflow,
  readOnly = false,
}: {
  permissionTypeId: string;
  fieldOptions: Array<{ key: string; label: string; material?: boolean }>;
  roles: Array<{ id: string; name: string }>;
  people: Array<{ id: string; name: string; email: string }>;
  workflow?: WorkflowDraftInput | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(saveWorkflowAction, initialState);
  const [name, setName] = useState(workflow?.name ?? "Standard approval chain");
  const [stages, setStages] = useState<StageDraft[]>(() =>
    (workflow?.stages ?? [
      {
        name: "Faculty guide review",
        approverType: "PROJECT_FACULTY_GUIDE",
        approverRoleId: null,
        approverUserId: null,
        departmentScope: "PROJECT_DEPARTMENT",
        canEditFields: [],
        invalidatesOn: [],
        slaHours: 72,
        conditions: null,
      },
    ]).map(toDraft)
  );
  const [blockingError, setBlockingError] = useState<string | null>(null);

  useEffect(() => {
    if (!state.ok) return;
    if (state.redirectTo) router.push(state.redirectTo);
    else router.refresh();
  }, [state, router]);

  const update = (index: number, patch: Partial<StageDraft>) =>
    setStages((current) =>
      current.map((stage, position) => (position === index ? { ...stage, ...patch } : stage))
    );

  const move = (index: number, direction: -1 | 1) =>
    setStages((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const addStage = () =>
    setStages((current) => [
      ...current,
      {
        name: `Stage ${current.length + 1}`,
        approverType: "DEPARTMENT_HEAD",
        approverRoleId: "",
        approverUserId: "",
        departmentScope: "PROJECT_DEPARTMENT",
        canEditFields: [],
        invalidatesOn: [],
        slaHours: "72",
        conditionsText: "",
      },
    ]);

  function buildPayload(): { payload: WorkflowDraftInput | null; error: string | null } {
    const payloadStages: WorkflowDraftInput["stages"] = [];
    for (const stage of stages) {
      let conditions: Record<string, unknown> | null = null;
      if (stage.conditionsText.trim()) {
        try {
          conditions = JSON.parse(stage.conditionsText);
        } catch {
          return {
            payload: null,
            error: `Stage “${stage.name}” has invalid conditions JSON.`,
          };
        }
      }
      payloadStages.push({
        name: stage.name.trim(),
        approverType: stage.approverType,
        approverRoleId: stage.approverRoleId || null,
        approverUserId: stage.approverUserId || null,
        departmentScope: stage.departmentScope,
        canEditFields: stage.canEditFields,
        invalidatesOn: stage.invalidatesOn,
        slaHours: stage.slaHours ? Number(stage.slaHours) : null,
        conditions,
      });
    }
    return { payload: { id: workflow?.id ?? null, name: name.trim(), stages: payloadStages }, error: null };
  }

  const { payload } = buildPayload();

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const built = buildPayload();
        if (!built.payload) {
          event.preventDefault();
          setBlockingError(built.error);
        } else {
          setBlockingError(null);
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="workflow" value={payload ? JSON.stringify({ permissionTypeId, ...payload }) : ""} />
      <FormMessage state={state} />
      {blockingError ? (
        <Alert variant="danger" title="Fix the workflow before saving">
          <p>{blockingError}</p>
        </Alert>
      ) : null}
      {readOnly ? (
        <Alert variant="info" title="This workflow version is locked">
          <p>
            Published versions and versions used by requests cannot be edited. Create a new version
            to change the approval chain.
          </p>
        </Alert>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="wf-name">Workflow name</Label>
        <Input
          id="wf-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={160}
          required
          disabled={readOnly}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Approval stages</h3>
          <p className="text-xs text-muted-foreground">
            Stages run in order. Each stage resolves its approver from the project and department.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addStage} disabled={readOnly}>
          <Plus className="h-4 w-4" /> Add stage
        </Button>
      </div>

      <ol className="space-y-3">
        {stages.map((stage, index) => (
          <li key={index} className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-start gap-2">
              <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_170px_110px]">
                  <div className="space-y-1">
                    <Label className="text-xs">Stage name</Label>
                    <Input
                      value={stage.name}
                      onChange={(event) => update(index, { name: event.target.value })}
                      maxLength={160}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Approver type</Label>
                    <select
                      value={stage.approverType}
                      onChange={(event) => update(index, { approverType: event.target.value })}
                      className={selectClass}
                      disabled={readOnly}
                    >
                      {APPROVER_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {APPROVER_TYPE_LABELS[type] ?? type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">SLA (hours)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={8760}
                      value={stage.slaHours}
                      onChange={(event) => update(index, { slaHours: event.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                </div>

                {stage.approverType === "ROLE" || stage.approverType === "CUSTOM" ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Role</Label>
                    <select
                      value={stage.approverRoleId}
                      onChange={(event) => update(index, { approverRoleId: event.target.value })}
                      className={selectClass}
                      disabled={readOnly}
                    >
                      <option value="">Select a role</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {stage.approverType === "USER" || stage.approverType === "CUSTOM" ? (
                  <div className="space-y-1">
                    <Label className="text-xs">Specific user</Label>
                    <select
                      value={stage.approverUserId}
                      onChange={(event) => update(index, { approverUserId: event.target.value })}
                      className={selectClass}
                      disabled={readOnly}
                    >
                      <option value="">Select a person</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name} — {person.email}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Department scope</Label>
                    <select
                      value={stage.departmentScope}
                      onChange={(event) => update(index, { departmentScope: event.target.value })}
                      className={selectClass}
                      disabled={readOnly}
                    >
                      {SCOPES.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Run only when (JSON condition, optional)</Label>
                    <Input
                      value={stage.conditionsText}
                      onChange={(event) => update(index, { conditionsText: event.target.value })}
                      placeholder='{"field":"needs_equipment","equals":true}'
                      className="font-mono text-xs"
                      disabled={readOnly}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fields this stage may edit</Label>
                    <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                      {fieldOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No form fields.</p>
                      ) : (
                        fieldOptions.map((field) => (
                          <label key={field.key} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={stage.canEditFields.includes(field.key)}
                              onChange={(event) =>
                                update(index, {
                                  canEditFields: event.target.checked
                                    ? [...stage.canEditFields, field.key]
                                    : stage.canEditFields.filter((key) => key !== field.key),
                                })
                              }
                              className="h-3.5 w-3.5 rounded border-input"
                              disabled={readOnly}
                            />
                            {field.label}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Invalidate this approval when these fields change
                    </Label>
                    <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
                      {fieldOptions.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No form fields.</p>
                      ) : (
                        fieldOptions.map((field) => (
                          <label key={field.key} className="flex items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              checked={stage.invalidatesOn.includes(field.key)}
                              onChange={(event) =>
                                update(index, {
                                  invalidatesOn: event.target.checked
                                    ? [...stage.invalidatesOn, field.key]
                                    : stage.invalidatesOn.filter((key) => key !== field.key),
                                })
                              }
                              className="h-3.5 w-3.5 rounded border-input"
                              disabled={readOnly}
                            />
                            {field.label}
                            {field.material ? (
                              <Badge variant="warning" className="ml-auto text-[9px]">
                                material
                              </Badge>
                            ) : null}
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-col gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => move(index, -1)}
                  disabled={readOnly || index === 0}
                  aria-label="Move stage up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => move(index, 1)}
                  disabled={readOnly || index === stages.length - 1}
                  aria-label="Move stage down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-rose-600"
                  onClick={() =>
                    setStages((current) => current.filter((_, position) => position !== index))
                  }
                  disabled={readOnly || stages.length === 1}
                  aria-label="Remove stage"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {!readOnly ? (
        <div className="flex justify-end">
          <SubmitButton pendingLabel="Saving…">
            <Save className="h-4 w-4" /> Save workflow draft
          </SubmitButton>
        </div>
      ) : null}
    </form>
  );
}

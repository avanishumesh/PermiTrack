"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { savePermissionTypeAction } from "@/app/actions/admin";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/errors";
import type { FieldType, FormField, FormOption, FormSchema, PermissionType } from "@/lib/types";

const initialState: ActionState = { ok: false };

const FIELD_TYPES: FieldType[] = [
  "text",
  "textarea",
  "email",
  "date",
  "datetime",
  "number",
  "select",
  "multiselect",
  "checkbox",
];

interface FieldDraft {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  material: boolean;
  help: string;
  placeholder: string;
  optionsText: string;
  visibleIfText: string;
}

function toDraft(field: FormField): FieldDraft {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    required: Boolean(field.required),
    material: Boolean(field.material),
    help: field.help ?? "",
    placeholder: field.placeholder ?? "",
    optionsText: (field.options ?? [])
      .map((option) => `${option.value}: ${option.label}`)
      .join("\n"),
    visibleIfText: field.visible_if ? JSON.stringify(field.visible_if) : "",
  };
}

function optionsFromText(text: string): FormOption[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf(":");
      if (index === -1) return { value: line, label: line };
      const value = line.slice(0, index).trim();
      const label = line.slice(index + 1).trim() || value;
      return { value, label };
    });
}

function toField(draft: FieldDraft): FormField {
  const field: FormField = {
    key: draft.key.trim(),
    label: draft.label.trim(),
    type: draft.type,
  };
  if (draft.required) field.required = true;
  if (draft.material) field.material = true;
  if (draft.help.trim()) field.help = draft.help.trim();
  if (draft.placeholder.trim()) field.placeholder = draft.placeholder.trim();
  if (draft.type === "select" || draft.type === "multiselect") {
    field.options = optionsFromText(draft.optionsText);
  }
  if (draft.visibleIfText.trim()) {
    try {
      field.visible_if = JSON.parse(draft.visibleIfText);
    } catch {
      // Server validation reports invalid conditions; keep the raw text for the editor.
    }
  }
  return field;
}

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PermissionTypeEditor({
  permissionType,
  departments,
}: {
  permissionType?: PermissionType | null;
  departments: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(savePermissionTypeAction, initialState);

  const [fields, setFields] = useState<FieldDraft[]>(() =>
    (permissionType?.form_schema?.fields ?? []).map(toDraft)
  );
  const [eligibility, setEligibility] = useState(
    permissionType?.eligibility_rules ? JSON.stringify(permissionType.eligibility_rules, null, 2) : ""
  );

  useEffect(() => {
    if (!state.ok) return;
    if (state.redirectTo) router.push(state.redirectTo);
    else router.refresh();
  }, [state, router]);

  const schema: FormSchema = { fields: fields.map(toField) };

  const updateField = (index: number, patch: Partial<FieldDraft>) =>
    setFields((current) =>
      current.map((field, position) => (position === index ? { ...field, ...patch } : field))
    );

  const move = (index: number, direction: -1 | 1) =>
    setFields((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (index: number) =>
    setFields((current) => current.filter((_, position) => position !== index));

  const addField = () =>
    setFields((current) => [
      ...current,
      {
        key: `field_${current.length + 1}`,
        label: "New field",
        type: "text",
        required: false,
        material: false,
        help: "",
        placeholder: "",
        optionsText: "",
        visibleIfText: "",
      },
    ]);

  const schemaErrors = Object.entries(state.fieldErrors ?? {}).filter(([key]) =>
    key.startsWith("formSchema")
  );

  return (
    <form action={formAction} className="space-y-4">
      {permissionType ? <input type="hidden" name="id" value={permissionType.id} /> : null}
      <FormMessage state={state} />

      {schemaErrors.length > 0 ? (
        <Alert variant="danger" title="The form definition has problems">
          <ul className="list-inside list-disc text-xs">
            {schemaErrors.slice(0, 6).map(([key, messages]) => (
              <li key={key}>
                {key}: {messages[0]}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pt-name">Name</Label>
          <Input
            id="pt-name"
            name="name"
            defaultValue={permissionType?.name}
            required
            maxLength={160}
            placeholder="Lab equipment access"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt-department">Department</Label>
          <select
            id="pt-department"
            name="departmentId"
            defaultValue={permissionType?.department_id ?? ""}
            className={selectClass}
          >
            <option value="">Available to every department</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pt-description">Description</Label>
        <Textarea
          id="pt-description"
          name="description"
          defaultValue={permissionType?.description ?? ""}
          rows={2}
          maxLength={2000}
          placeholder="What this permission grants and who it applies to."
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={permissionType?.is_active ?? true}
          className="h-4 w-4 rounded border-input"
        />
        Available for new requests
      </label>

      <input type="hidden" name="formSchema" value={JSON.stringify(schema)} />
      <input type="hidden" name="eligibilityRules" value={eligibility.trim() ? eligibility : ""} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Form fields</h3>
            <p className="text-xs text-muted-foreground">
              Keys are stable identifiers. Mark fields as material when a change should invalidate
              earlier approvals.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addField}>
            <Plus className="h-4 w-4" /> Add field
          </Button>
        </div>

        {fields.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No fields yet. Add the first field to build the form.
          </p>
        ) : (
          <ul className="space-y-2">
            {fields.map((field, index) => (
              <li key={index} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_150px]">
                      <div className="space-y-1">
                        <Label htmlFor={`field-label-${index}`} className="text-xs">
                          Label
                        </Label>
                        <Input
                          id={`field-label-${index}`}
                          value={field.label}
                          onChange={(event) => updateField(index, { label: event.target.value })}
                          maxLength={160}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`field-key-${index}`} className="text-xs">
                          Key
                        </Label>
                        <Input
                          id={`field-key-${index}`}
                          value={field.key}
                          onChange={(event) => updateField(index, { key: event.target.value })}
                          maxLength={64}
                          className="font-mono text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`field-type-${index}`} className="text-xs">
                          Type
                        </Label>
                        <select
                          id={`field-type-${index}`}
                          value={field.type}
                          onChange={(event) =>
                            updateField(index, { type: event.target.value as FieldType })
                          }
                          className={selectClass}
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {field.type === "select" || field.type === "multiselect" ? (
                      <div className="space-y-1">
                        <Label htmlFor={`field-options-${index}`} className="text-xs">
                          Options — one per line, <span className="font-mono">value: Label</span>
                        </Label>
                        <Textarea
                          id={`field-options-${index}`}
                          value={field.optionsText}
                          onChange={(event) => updateField(index, { optionsText: event.target.value })}
                          rows={3}
                          className="font-mono text-xs"
                          placeholder={"yes: Yes\nno: No"}
                        />
                      </div>
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`field-help-${index}`} className="text-xs">
                          Help text
                        </Label>
                        <Input
                          id={`field-help-${index}`}
                          value={field.help}
                          onChange={(event) => updateField(index, { help: event.target.value })}
                          maxLength={500}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`field-placeholder-${index}`} className="text-xs">
                          Placeholder
                        </Label>
                        <Input
                          id={`field-placeholder-${index}`}
                          value={field.placeholder}
                          onChange={(event) => updateField(index, { placeholder: event.target.value })}
                          maxLength={200}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`field-visible-${index}`} className="text-xs">
                        Visibility condition (JSON, optional)
                      </Label>
                      <Input
                        id={`field-visible-${index}`}
                        value={field.visibleIfText}
                        onChange={(event) => updateField(index, { visibleIfText: event.target.value })}
                        placeholder='{"field":"needs_equipment","equals":true}'
                        className="font-mono text-xs"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(event) => updateField(index, { required: event.target.checked })}
                          className="h-3.5 w-3.5 rounded border-input"
                        />
                        Required
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={field.material}
                          onChange={(event) => updateField(index, { material: event.target.checked })}
                          className="h-3.5 w-3.5 rounded border-input"
                        />
                        Material (change triggers re-approval)
                      </label>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => move(index, 1)}
                      disabled={index === fields.length - 1}
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-rose-600"
                      onClick={() => remove(index)}
                      aria-label="Remove field"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pt-eligibility">Eligibility rules (JSON, optional)</Label>
        <Textarea
          id="pt-eligibility"
          value={eligibility}
          onChange={(event) => setEligibility(event.target.value)}
          rows={3}
          className="font-mono text-xs"
          placeholder='{"max_duration_days": 30}'
        />
        <p className="text-[11px] text-muted-foreground">
          Advisory metadata used by administrators when reviewing requests. It never grants a
          permission automatically.
        </p>
      </div>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">
          <Save className="h-4 w-4" /> Save permission type
        </SubmitButton>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { PencilLine } from "lucide-react";
import { authorityEditAction } from "@/app/actions/requests";
import { FormMessage } from "@/components/form-message";
import { SchemaFields } from "@/components/requests/schema-fields";
import { SubmitButton } from "@/components/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { defaultFormValues } from "@/lib/forms/schema";
import type { ActionState } from "@/lib/errors";
import type { FormSchema } from "@/lib/types";

const initialState: ActionState = { ok: false };

export function AuthorityEditForm({
  requestId,
  stageStateId,
  schema,
  initialValues,
  editableKeys,
  materialKeys,
}: {
  requestId: string;
  stageStateId: string;
  schema: FormSchema;
  initialValues: Record<string, unknown> | null;
  editableKeys: string[];
  /** Fields whose change invalidates earlier approvals. */
  materialKeys: string[];
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(authorityEditAction, initialState);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    defaultFormValues(schema, initialValues)
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const setValue = (key: string, value: unknown) =>
    setValues((current) => ({ ...current, [key]: value }));

  const materialSet = new Set(materialKeys);
  const hasMaterial = editableKeys.some((key) => materialSet.has(key));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="stageStateId" value={stageStateId} />
      <FormMessage state={state} />

      <SchemaFields
        schema={schema}
        values={values}
        onChange={setValue}
        onlyKeys={editableKeys}
        fieldErrors={state.fieldErrors}
      />

      {hasMaterial ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Editing a material field invalidates earlier approvals that depend on it. The request will
          restart at the earliest invalidated stage.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="authority-reason">Reason for the change</Label>
        <Textarea
          id="authority-reason"
          name="reason"
          rows={2}
          maxLength={2000}
          placeholder="Recorded in the audit trail and shown to the student."
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox id="authority-internal" name="isInternal" />
        <span>
          <span className="font-medium">Internal note</span>
          <span className="block text-xs text-muted-foreground">
            Hide this edit from the student. Other approvers and administrators still see it.
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Saving…">
          <PencilLine className="h-4 w-4" /> Save changes
        </SubmitButton>
      </div>
    </form>
  );
}

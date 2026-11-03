"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Save, Send } from "lucide-react";
import { resubmitAction, saveDraftAction } from "@/app/actions/requests";
import { FormMessage } from "@/components/form-message";
import { SchemaFields } from "@/components/requests/schema-fields";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { defaultFormValues } from "@/lib/forms/schema";
import type { ActionState } from "@/lib/errors";
import type { FormSchema } from "@/lib/types";

const initialState: ActionState = { ok: false };

export function RequestForm({
  mode,
  requestId,
  schema,
  initialValues,
  queryId,
}: {
  mode: "draft" | "resubmit";
  requestId: string;
  schema: FormSchema;
  initialValues?: Record<string, unknown> | null;
  queryId?: string | null;
}) {
  const router = useRouter();
  const action = mode === "draft" ? saveDraftAction : resubmitAction;
  const [state, formAction] = useActionState(action, initialState);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    defaultFormValues(schema, initialValues)
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const setValue = (key: string, value: unknown) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="requestId" value={requestId} />
      {queryId ? <input type="hidden" name="queryId" value={queryId} /> : null}
      <FormMessage state={state} />

      <SchemaFields
        schema={schema}
        values={values}
        onChange={setValue}
        fieldErrors={state.fieldErrors}
      />

      {mode === "resubmit" ? (
        <div className="space-y-1.5">
          <Label htmlFor="reason">What changed?</Label>
          <Textarea
            id="reason"
            name="reason"
            rows={3}
            maxLength={2000}
            placeholder="Explain how you addressed the approver's feedback."
            required
          />
          <p className="text-xs text-muted-foreground">
            The approver sees this note with your resubmission. It is recorded in the audit trail.
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Submitting validates every required field and required document, then routes the request to
          the first approver of the pinned workflow version. Save a draft to continue later.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {mode === "draft" ? (
          <>
            <SubmitButton
              name="intent"
              value="save"
              variant="outline"
              pendingLabel="Saving…"
            >
              <Save className="h-4 w-4" /> Save draft
            </SubmitButton>
            <SubmitButton name="intent" value="submit" pendingLabel="Submitting…">
              <Send className="h-4 w-4" /> Submit for review
            </SubmitButton>
          </>
        ) : (
          <SubmitButton pendingLabel="Resubmitting…">
            <Send className="h-4 w-4" /> Resubmit
          </SubmitButton>
        )}
      </div>
    </form>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { UserCheck } from "lucide-react";
import { assignStageAction } from "@/app/actions/admin";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

export function AssignStageForm({
  requestId,
  stageStateId,
  stageName,
  candidates,
}: {
  requestId: string;
  stageStateId: string;
  stageName: string;
  candidates: Array<{ id: string; name: string; email: string }>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(assignStageAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="stageStateId" value={stageStateId} />
      <FormMessage state={state} />

      <div className="space-y-1.5">
        <Label htmlFor="assign-approver">Approver for “{stageName}”</Label>
        <select
          id="assign-approver"
          name="approverId"
          required
          defaultValue=""
          className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="" disabled>
            Select a person
          </option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} — {candidate.email}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Use this when the configured approver is missing or inactive. The assignment is audited.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="assign-reason">Reason</Label>
        <Textarea
          id="assign-reason"
          name="reason"
          rows={2}
          maxLength={2000}
          placeholder="e.g. The department head is on leave; assigning the acting head."
        />
      </div>

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Assigning…">
          <UserCheck className="h-4 w-4" /> Assign approver
        </SubmitButton>
      </div>
    </form>
  );
}

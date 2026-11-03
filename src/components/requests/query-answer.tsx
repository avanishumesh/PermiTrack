"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { MessageSquareReply } from "lucide-react";
import { performAction } from "@/app/actions/requests";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

export function QueryAnswer({
  requestId,
  queryId,
  stageStateId,
}: {
  requestId: string;
  queryId: string;
  stageStateId?: string | null;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(performAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="mt-3 space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="action" value="ANSWER_QUERY" />
      <input type="hidden" name="queryId" value={queryId} />
      {stageStateId ? <input type="hidden" name="stageStateId" value={stageStateId} /> : null}
      <FormMessage state={state} />
      <Textarea
        name="response"
        rows={3}
        required
        maxLength={4000}
        placeholder="Your answer…"
        aria-label="Answer the question"
      />
      <div className="flex justify-end">
        <SubmitButton size="sm" pendingLabel="Sending…">
          <MessageSquareReply className="h-4 w-4" /> Send answer
        </SubmitButton>
      </div>
    </form>
  );
}

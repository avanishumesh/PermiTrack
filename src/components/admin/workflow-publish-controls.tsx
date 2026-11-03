"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Power, Rocket } from "lucide-react";
import { deactivateWorkflowAction, publishWorkflowAction } from "@/app/actions/admin";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

export function WorkflowPublishControls({
  templateId,
  isActive,
  size = "sm",
}: {
  templateId: string;
  isActive: boolean;
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const [publishState, publishAction] = useActionState(publishWorkflowAction, initialState);
  const [deactivateState, deactivateAction] = useActionState(deactivateWorkflowAction, initialState);

  useEffect(() => {
    if (publishState.ok || deactivateState.ok) router.refresh();
  }, [publishState, deactivateState, router]);

  return (
    <div className="space-y-1">
      {isActive ? (
        <form action={deactivateAction}>
          <input type="hidden" name="templateId" value={templateId} />
          <SubmitButton variant="outline" size={size} pendingLabel="Deactivating…">
            <Power className="h-4 w-4" /> Deactivate
          </SubmitButton>
        </form>
      ) : (
        <form action={publishAction}>
          <input type="hidden" name="templateId" value={templateId} />
          <SubmitButton size={size} pendingLabel="Publishing…">
            <Rocket className="h-4 w-4" /> Publish
          </SubmitButton>
        </form>
      )}
      <FormMessage state={publishState.ok ? publishState : deactivateState} />
    </div>
  );
}

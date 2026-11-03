"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { verifyDocumentAction } from "@/app/actions/requests";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

export function VerifyDocumentForm({
  requestId,
  documentId,
  status,
}: {
  requestId: string;
  documentId: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(verifyDocumentAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="documentId" value={documentId} />
      <select
        name="status"
        defaultValue={status}
        aria-label="Verification status"
        className="h-7 rounded-md border border-input bg-card px-1.5 text-[11px] shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="PENDING">Pending</option>
        <option value="VERIFIED">Verified</option>
        <option value="REJECTED">Rejected</option>
      </select>
      <SubmitButton size="sm" variant="ghost" className="h-7 px-2 text-[11px]" pendingLabel="Saving…">
        <ShieldCheck className="h-3 w-3" /> Save
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

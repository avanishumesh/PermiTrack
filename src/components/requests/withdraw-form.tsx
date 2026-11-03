"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Undo2 } from "lucide-react";
import { withdrawRequestAction } from "@/app/actions/requests";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

export function WithdrawForm({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(withdrawRequestAction, initialState);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">
          <Undo2 className="h-4 w-4" /> Withdraw
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw this request?</DialogTitle>
          <DialogDescription>
            Withdrawing stops the approval process. The record stays visible with its full history,
            but no approver can act on it. You will need to create a new request to try again.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="requestId" value={requestId} />
          <FormMessage state={state} />
          <div className="space-y-1.5">
            <Label htmlFor="withdraw-reason">Reason (optional)</Label>
            <Textarea
              id="withdraw-reason"
              name="reason"
              rows={2}
              maxLength={2000}
              placeholder="e.g. The experiment was cancelled."
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep request
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Withdrawing…">
              Withdraw request
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

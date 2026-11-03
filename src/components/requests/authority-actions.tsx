"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  HelpCircle,
  Send,
  Share2,
  UserCog,
  XCircle,
} from "lucide-react";
import { performAction } from "@/app/actions/requests";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

const selectClass =
  "flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function InternalToggle() {
  return (
    <label className="flex items-start gap-2 text-xs text-muted-foreground">
      <Checkbox name="isInternal" />
      <span>Internal note — hidden from the student</span>
    </label>
  );
}

export function AuthorityActions({
  requestId,
  stageStateId,
  stageName,
  isFinalStage,
  forwardTargets,
  delegates,
}: {
  requestId: string;
  stageStateId: string;
  stageName: string;
  isFinalStage: boolean;
  forwardTargets: Array<{ id: string; name: string; sequence: number }>;
  delegates: Array<{ id: string; name: string; email: string }>;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(performAction, initialState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const shared = (
    <>
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="stageStateId" value={stageStateId} />
    </>
  );

  return (
    <div className="space-y-3">
      <FormMessage state={state} />

      <Tabs defaultValue="approve">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 h-auto p-1">
          <TabsTrigger value="approve">Approve</TabsTrigger>
          <TabsTrigger value="changes">Request changes</TabsTrigger>
          <TabsTrigger value="reject">Reject</TabsTrigger>
          <TabsTrigger value="query">Ask question</TabsTrigger>
          <TabsTrigger value="forward">Forward</TabsTrigger>
          <TabsTrigger value="delegate">Delegate</TabsTrigger>
        </TabsList>

        <TabsContent value="approve">
          <form action={formAction} className="space-y-3">
            {shared}
            <input type="hidden" name="action" value="APPROVE_STAGE" />
            <p className="text-sm text-muted-foreground">
              Approving <span className="font-medium text-foreground">{stageName}</span>{" "}
              {isFinalStage
                ? "completes the workflow and issues the permission."
                : "moves the request to the next stage."}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="approve-comment">Comment (optional)</Label>
              <Textarea id="approve-comment" name="comment" rows={2} maxLength={4000} />
            </div>
            <InternalToggle />
            <div className="flex justify-end">
              <SubmitButton pendingLabel="Approving…">
                <CheckCircle2 className="h-4 w-4" /> Approve stage
              </SubmitButton>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="changes">
          <form action={formAction} className="space-y-3">
            {shared}
            <input type="hidden" name="action" value="REQUEST_CHANGES" />
            <p className="text-sm text-muted-foreground">
              The request pauses and returns to the student. Explain exactly what must change.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="changes-comment">What needs to change?</Label>
              <Textarea
                id="changes-comment"
                name="comment"
                rows={4}
                required
                maxLength={4000}
                placeholder="e.g. The requested dates overlap with a scheduled maintenance window. Please move them to the following week."
              />
            </div>
            <InternalToggle />
            <div className="flex justify-end">
              <SubmitButton variant="outline" pendingLabel="Sending…">
                <ArrowRightLeft className="h-4 w-4" /> Request changes
              </SubmitButton>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="reject">
          <form action={formAction} className="space-y-3">
            {shared}
            <input type="hidden" name="action" value="REJECT_REQUEST" />
            <p className="text-sm text-rose-700">
              Rejecting ends this request. This cannot be undone — the student must start a new
              request.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reject-comment">Reason for rejection</Label>
              <Textarea
                id="reject-comment"
                name="comment"
                rows={3}
                required
                maxLength={4000}
                placeholder="Explain the policy or safety reason for rejecting the request."
              />
            </div>
            <InternalToggle />
            <div className="flex justify-end">
              <SubmitButton variant="destructive" pendingLabel="Rejecting…">
                <XCircle className="h-4 w-4" /> Reject request
              </SubmitButton>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="query">
          <form action={formAction} className="space-y-3">
            {shared}
            <input type="hidden" name="action" value="ASK_QUERY" />
            <p className="text-sm text-muted-foreground">
              Ask the student a question without deciding. Blocking questions pause the stage until
              answered.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="query-comment">Your question</Label>
              <Textarea
                id="query-comment"
                name="comment"
                rows={3}
                required
                maxLength={4000}
                placeholder="e.g. Which room will the equipment be stored in?"
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox name="isBlocking" defaultChecked />
              <span>Pause this stage until the student answers</span>
            </label>
            <InternalToggle />
            <div className="flex justify-end">
              <SubmitButton variant="outline" pendingLabel="Sending…">
                <HelpCircle className="h-4 w-4" /> Send question
              </SubmitButton>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="forward">
          <form action={formAction} className="space-y-3">
            {shared}
            <input type="hidden" name="action" value="FORWARD_STAGE" />
            <p className="text-sm text-muted-foreground">
              Forward this stage to a later approver. This is recorded in the audit trail and both
              approvers are notified.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="forward-target">Forward to</Label>
              <select id="forward-target" name="targetStageStateId" className={selectClass} required>
                <option value="">Select a later stage</option>
                {forwardTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    Stage {target.sequence} — {target.name}
                  </option>
                ))}
              </select>
              {forwardTargets.length === 0 ? (
                <p className="text-xs text-muted-foreground">There are no later stages to forward to.</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="forward-comment">Reason</Label>
              <Textarea id="forward-comment" name="comment" rows={2} required maxLength={4000} />
            </div>
            <div className="flex justify-end">
              <SubmitButton variant="outline" pendingLabel="Forwarding…" disabled={forwardTargets.length === 0}>
                <Share2 className="h-4 w-4" /> Forward
              </SubmitButton>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="delegate">
          <form action={formAction} className="space-y-3">
            {shared}
            <input type="hidden" name="action" value="DELEGATE_STAGE" />
            <p className="text-sm text-muted-foreground">
              Hand this stage to another authorized person. You will no longer be able to act on it.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="delegate-user">Delegate to</Label>
              <select id="delegate-user" name="delegateToUserId" className={selectClass} required>
                <option value="">Select a person</option>
                {delegates.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} — {person.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delegate-comment">Reason (optional)</Label>
              <Textarea id="delegate-comment" name="comment" rows={2} maxLength={4000} />
            </div>
            <div className="flex justify-end">
              <SubmitButton variant="outline" pendingLabel="Delegating…">
                <UserCog className="h-4 w-4" /> Delegate
              </SubmitButton>
            </div>
          </form>
        </TabsContent>
      </Tabs>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Send className="h-3 w-3" /> Every action is authorized by the database and written to the
        audit trail.
      </p>
    </div>
  );
}

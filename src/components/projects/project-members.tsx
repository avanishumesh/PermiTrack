"use client";

import { useActionState } from "react";
import { UserMinus, UserPlus } from "lucide-react";
import { addMemberAction, removeMemberAction } from "@/app/actions/projects";
import { FieldError, FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/errors";
import type { DirectoryPerson } from "@/lib/services/projects";
import { initials } from "@/lib/utils";

const initialState: ActionState = { ok: false };

const MEMBER_ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  MEMBER: "Member",
  FACULTY_GUIDE: "Faculty guide",
};

export function ProjectMembers({
  projectId,
  members,
  candidates,
  canManage,
}: {
  projectId: string;
  members: Array<{
    user_id: string;
    role: string;
    profiles?: { name: string; email: string } | null;
  }>;
  candidates: DirectoryPerson[];
  canManage: boolean;
}) {
  const [state, formAction] = useActionState(addMemberAction, initialState);
  const existing = new Set(members.map((member) => member.user_id));
  const available = candidates.filter((candidate) => !existing.has(candidate.id));

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {members.map((member) => (
          <li key={member.user_id} className="flex items-center gap-3 p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {initials(member.profiles?.name, member.profiles?.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{member.profiles?.name ?? "Unknown user"}</p>
              <p className="truncate text-xs text-muted-foreground">{member.profiles?.email}</p>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              {MEMBER_ROLE_LABELS[member.role] ?? member.role}
            </span>
            {canManage && member.role !== "OWNER" ? (
              <form
                action={async (formData: FormData) => {
                  await removeMemberAction({ ok: false }, formData);
                }}
              >
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="userId" value={member.user_id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${member.profiles?.name ?? "member"}`}
                >
                  <UserMinus className="h-4 w-4 text-rose-600" />
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      {canManage ? (
        <form action={formAction} className="space-y-3 rounded-lg border bg-muted/30 p-4">
          <input type="hidden" name="projectId" value={projectId} />
          <FormMessage state={state} />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="member-user">Add a team member</Label>
              <select
                id="member-user"
                name="userId"
                className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
              >
                <option value="">Select a person</option>
                {available.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} — {candidate.email}
                  </option>
                ))}
              </select>
              <FieldError errors={state.fieldErrors?.userId} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-role">Role</Label>
              <select
                id="member-role"
                name="role"
                defaultValue="MEMBER"
                className="flex h-9 rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="MEMBER">Member</option>
                <option value="EDITOR">Editor</option>
              </select>
            </div>
            <SubmitButton variant="outline" pendingLabel="Adding…">
              <UserPlus className="h-4 w-4" /> Add
            </SubmitButton>
          </div>
          {available.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No more people in your department can be added. Administrators can add members from
              other departments.
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

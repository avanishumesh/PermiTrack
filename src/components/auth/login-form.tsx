"use client";

import Link from "next/link";
import { useActionState } from "react";
import { GraduationCap, ShieldCheck } from "lucide-react";
import { demoLoginAction, loginAction } from "@/app/actions/auth";
import { FieldError, FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState(loginAction, initialState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <FormMessage state={state} />
        <div className="space-y-1.5">
          <Label htmlFor="email">University email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@university.edu"
            required
          />
          <FieldError errors={state.fieldErrors?.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <FieldError errors={state.fieldErrors?.password} />
        </div>
        <SubmitButton className="w-full" pendingLabel="Signing in…">
          Sign in
        </SubmitButton>
        <p className="text-center text-sm text-muted-foreground">
          New to PermiTrack?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>or try instantly, no password needed</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <form action={demoLoginAction.bind(null, "student")}>
          <Button type="submit" variant="outline" className="w-full">
            <GraduationCap className="h-4 w-4" /> Demo student
          </Button>
        </form>
        <form action={demoLoginAction.bind(null, "admin")}>
          <Button type="submit" variant="outline" className="w-full">
            <ShieldCheck className="h-4 w-4" /> Demo admin
          </Button>
        </form>
      </div>
      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        Demo logins open a live shared workspace: the student submits, the admin approves, and
        both sides update instantly. Data resets when the server restarts.
      </p>
    </div>
  );
}

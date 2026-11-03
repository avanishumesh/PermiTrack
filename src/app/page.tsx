import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileLock2,
  GitBranch,
  History,
  ListChecks,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { getViewer } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  {
    icon: ListChecks,
    title: "Dynamic permission forms",
    body: "Administrators design each permission type once. Students see only the fields that apply to their request, with conditional logic and required documents.",
  },
  {
    icon: Workflow,
    title: "Versioned approval workflows",
    body: "Every request pins the workflow version it started on. Editing a workflow creates a new version, so in-flight approvals never shift underneath anyone.",
  },
  {
    icon: GitBranch,
    title: "Hierarchical routing",
    body: "Route to the project's faculty guide, the department head, a role holder, a lab manager or a dean — scoped to the project's department or its parents.",
  },
  {
    icon: History,
    title: "Auditable by design",
    body: "Approvals, rejections, queries, edits, delegations and material changes are written to an immutable audit trail with before/after revisions.",
  },
  {
    icon: FileLock2,
    title: "Private documents",
    body: "Documents live in a private bucket behind row-level security. Downloads use five-minute signed URLs and every upload is MIME- and size-validated.",
  },
  {
    icon: ShieldCheck,
    title: "Server-enforced authority",
    body: "Only the assigned approver, an active delegate or an administrator can act. Stage order, locks and final approval are enforced in the database.",
  },
];

const CHAIN = [
  { title: "Student submits", detail: "Draft validated, documents checked" },
  { title: "Faculty guide", detail: "Reviews scope and purpose" },
  { title: "Lab manager", detail: "Confirms equipment availability" },
  { title: "Department head", detail: "Issues the final permission" },
];

export default async function LandingPage() {
  const viewer = await getViewer();
  if (viewer) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Brand />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/register">Get started</Link>
          </Button>
        </nav>
      </header>

      <main>
        <section className="hero-grid border-y">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
            <div className="space-y-6">
              <Badge variant="info" className="w-fit">
                Built for university research and lab access
              </Badge>
              <h1 className="text-balance text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Permissions that move through your university — not around it.
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
                PermiTrack replaces email chains and shared spreadsheets with a single, auditable
                workflow: dynamic forms, hierarchical approvers, versioned stages and a complete
                decision history.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/register">
                    Create a student account <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
              <ul className="grid gap-2 pt-2 text-sm text-muted-foreground sm:grid-cols-2">
                {[
                  "Row-level security on every table",
                  "Configurable, versioned workflows",
                  "Five-minute signed document links",
                  "Complete audit trail",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Approval chain</p>
                  <p className="text-sm font-semibold">Lab Equipment Access</p>
                </div>
                <Badge variant="warning">Under review</Badge>
              </div>
              <ol className="mt-4 space-y-4">
                {CHAIN.map((step, index) => {
                  const complete = index < 2;
                  const active = index === 2;
                  return (
                    <li key={step.title} className="flex gap-3">
                      <span
                        className={
                          complete
                            ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
                            : active
                              ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"
                              : "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
                        }
                      >
                        {complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                      </span>
                      <div className="pt-0.5">
                        <p className="text-sm font-medium leading-none">{step.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
                      </div>
                      <span className="ml-auto pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        {complete ? "Done" : active ? "Active" : "Pending"}
                      </span>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-5 rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
                If an authority changes a material field, earlier approvals are invalidated and the
                request restarts at the correct stage — automatically.
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-16">
          <div className="max-w-2xl space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Why PermiTrack</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              One workflow engine, enforced where it matters
            </h2>
            <p className="text-sm text-muted-foreground">
              Authorization is not a UI concern. Every state transition runs inside a locked
              database transaction and re-checks the signed-in user, the stage order and the
              pinned workflow version.
            </p>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-xl border bg-card p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <feature.icon className="h-4 w-4" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>PermiTrack — hierarchical permission management for universities.</span>
          <span>Server-enforced · RLS everywhere · Audit logged</span>
        </div>
      </footer>
    </div>
  );
}

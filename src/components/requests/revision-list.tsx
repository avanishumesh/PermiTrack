import { formatFieldValue } from "@/lib/forms/schema";
import { EmptyState } from "@/components/empty-state";
import type { FormSchema, RequestRevision } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const REVISION_LABELS: Record<RequestRevision["revision_type"], string> = {
  STUDENT_EDIT: "Student edit",
  STUDENT_RESUBMISSION: "Resubmission",
  AUTHORITY_EDIT: "Authority edit",
  DOCUMENT_REPLACEMENT: "Document replacement",
  WORKFLOW_REVALIDATION: "Workflow revalidation",
};

function display(schema: FormSchema, key: string, value: unknown) {
  const field = schema.fields.find((candidate) => candidate.key === key);
  if (!field) return value == null || value === "" ? "—" : String(value);
  return formatFieldValue(field, value);
}

export function RevisionList({
  revisions,
  schema,
  actors,
}: {
  revisions: RequestRevision[];
  schema: FormSchema;
  actors: Record<string, { name: string; email: string }>;
}) {
  if (revisions.length === 0) {
    return (
      <EmptyState
        title="No field changes"
        description="Every edit to submitted values is recorded here with before and after values."
        className="py-8"
      />
    );
  }

  return (
    <ol className="space-y-3">
      {revisions.map((revision) => {
        const before = revision.before_data ?? {};
        const after = revision.after_data ?? {};
        const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
          (key) => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)
        );

        return (
          <li key={revision.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {REVISION_LABELS[revision.revision_type]}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {actors[revision.actor_id]?.name ?? "Unknown user"}
                </span>
              </p>
              <span className="text-[11px] text-muted-foreground">
                {formatDateTime(revision.created_at)}
              </span>
            </div>
            {revision.reason ? (
              <p className="mt-1 text-xs text-muted-foreground">{revision.reason}</p>
            ) : null}
            {keys.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No visible field differences.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {keys.map((key) => {
                  const field = schema.fields.find((candidate) => candidate.key === key);
                  const isMaterial = field?.material;
                  return (
                    <li key={key} className="text-xs">
                      <span className="font-medium">
                        {field?.label ?? key}
                        {isMaterial ? (
                          <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">
                            material
                          </span>
                        ) : null}
                      </span>
                      <span className="ml-2 text-rose-700 line-through">
                        {display(schema, key, before[key])}
                      </span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="text-emerald-700">{display(schema, key, after[key])}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

import { Alert } from "@/components/ui/alert";
import type { ActionState } from "@/lib/errors";

export function FormMessage({ state }: { state: ActionState | undefined | null }) {
  if (!state?.message) return null;
  return (
    <Alert variant={state.ok ? "success" : "danger"} title={state.ok ? undefined : "Could not complete"}>
      <p>{state.message}</p>
    </Alert>
  );
}

export function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs font-medium text-destructive">{errors[0]}</p>;
}

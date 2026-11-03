"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { FilePlus2, Pencil, Trash2 } from "lucide-react";
import { deleteDocumentTypeAction, saveDocumentTypeAction } from "@/app/actions/admin";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ALLOWED_MIME_TYPES } from "@/lib/constants";
import type { RequiredDocumentType } from "@/lib/types";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/jpg": "JPG",
  "application/msword": "Word (.doc)",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (.docx)",
};

function DocumentDialog({
  permissionTypeId,
  document,
  trigger,
}: {
  permissionTypeId: string;
  document?: RequiredDocumentType;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(saveDocumentTypeAction, initialState);
  const [accepted, setAccepted] = useState<string[]>(
    document?.accepted_mime_types?.length ? document.accepted_mime_types : [...ALLOWED_MIME_TYPES]
  );

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{document ? `Edit ${document.name}` : "New document requirement"}</DialogTitle>
          <DialogDescription>
            Students must upload one current file for each required document. Versions are kept.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="permissionTypeId" value={permissionTypeId} />
          {document ? <input type="hidden" name="id" value={document.id} /> : null}
          <input type="hidden" name="acceptedMimeTypes" value={JSON.stringify(accepted)} />
          <FormMessage state={state} />

          <div className="space-y-1.5">
            <Label htmlFor={`doc-name-${document?.id ?? "new"}`}>Document name</Label>
            <Input
              id={`doc-name-${document?.id ?? "new"}`}
              name="name"
              defaultValue={document?.name}
              required
              maxLength={160}
              placeholder="Supervisor support letter"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`doc-desc-${document?.id ?? "new"}`}>Instructions (optional)</Label>
            <Textarea
              id={`doc-desc-${document?.id ?? "new"}`}
              name="description"
              defaultValue={document?.description ?? ""}
              rows={2}
              maxLength={1000}
              placeholder="Signed by your faculty guide, dated within the last 6 months."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`doc-size-${document?.id ?? "new"}`}>Max size (MB)</Label>
              <Input
                id={`doc-size-${document?.id ?? "new"}`}
                name="maxSizeMb"
                type="number"
                min={1}
                max={10}
                defaultValue={document?.max_size_mb ?? 10}
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                name="isRequired"
                defaultChecked={document?.is_required ?? true}
                className="h-4 w-4 rounded border-input"
              />
              Required before submission
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Accepted file types</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ALLOWED_MIME_TYPES.map((mime) => (
                <label key={mime} className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    checked={accepted.includes(mime)}
                    onChange={(event) =>
                      setAccepted((current) =>
                        event.target.checked
                          ? Array.from(new Set([...current, mime]))
                          : current.filter((item) => item !== mime)
                      )
                    }
                    className="h-3.5 w-3.5 rounded border-input"
                  />
                  {MIME_LABELS[mime] ?? mime}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              File contents are also sniffed server-side, so a renamed file is rejected.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Saving…">Save requirement</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDocumentButton({
  document,
  permissionTypeId,
}: {
  document: RequiredDocumentType;
  permissionTypeId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteDocumentTypeAction, initialState);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50">
          <Trash2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove “{document.name}”?</DialogTitle>
          <DialogDescription>
            New requests will no longer require this document. Existing requests keep their uploaded
            files and requirements.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={document.id} />
          <input type="hidden" name="permissionTypeId" value={permissionTypeId} />
          <FormMessage state={state} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="destructive" pendingLabel="Removing…">
              Remove requirement
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentRequirements({
  permissionTypeId,
  documents,
}: {
  permissionTypeId: string;
  documents: RequiredDocumentType[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DocumentDialog
          permissionTypeId={permissionTypeId}
          trigger={
            <Button size="sm" variant="outline">
              <FilePlus2 className="h-4 w-4" /> Add requirement
            </Button>
          }
        />
      </div>

      {documents.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No documents required. Students can still attach supplementary files.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {documents.map((document) => (
            <li key={document.id} className="flex flex-wrap items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {document.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {document.is_required ? "Required" : "Optional"} · up to {document.max_size_mb} MB
                  </span>
                </p>
                {document.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{document.description}</p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {document.accepted_mime_types.map((mime) => MIME_LABELS[mime] ?? mime).join(", ")}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <DocumentDialog
                  permissionTypeId={permissionTypeId}
                  document={document}
                  trigger={
                    <Button variant="ghost" size="sm">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  }
                />
                <DeleteDocumentButton document={document} permissionTypeId={permissionTypeId} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

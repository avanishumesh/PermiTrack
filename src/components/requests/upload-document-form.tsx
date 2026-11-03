"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Upload } from "lucide-react";
import { uploadDocumentAction } from "@/app/actions/requests";
import { FormMessage } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/errors";

const initialState: ActionState = { ok: false };

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "image/jpg": "JPG",
  "application/msword": "DOC",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
};

export function UploadDocumentForm({
  requestId,
  documentTypeId,
  documentName,
  replacesDocumentId,
  acceptedMimeTypes,
  maxSizeMb,
  label = "Upload document",
}: {
  requestId: string;
  documentTypeId?: string | null;
  documentName?: string | null;
  replacesDocumentId?: string | null;
  acceptedMimeTypes?: string[];
  maxSizeMb?: number;
  label?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(uploadDocumentAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  const accept = (acceptedMimeTypes?.length ? acceptedMimeTypes : undefined)
    ?.map((mime) => mime.replace("image/jpg", "image/jpeg"))
    .join(",");

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="requestId" value={requestId} />
      {documentTypeId ? <input type="hidden" name="documentTypeId" value={documentTypeId} /> : null}
      {replacesDocumentId ? (
        <input type="hidden" name="replacesDocumentId" value={replacesDocumentId} />
      ) : null}
      <FormMessage state={state} />
      <Label htmlFor={`upload-${documentTypeId ?? "extra"}`} className="text-xs">
        {label}
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={`upload-${documentTypeId ?? "extra"}`}
          name="file"
          type="file"
          required
          accept={accept}
          className="cursor-pointer file:mr-2 file:rounded file:border-0 file:bg-accent file:px-2 file:py-1 file:text-xs file:font-medium"
        />
        <SubmitButton variant="outline" pendingLabel="Uploading…" className="shrink-0">
          <Upload className="h-4 w-4" /> Upload
        </SubmitButton>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {documentName ? `${documentName} · ` : ""}
        {(acceptedMimeTypes?.length
          ? acceptedMimeTypes.map((mime) => MIME_LABELS[mime] ?? mime).join(", ")
          : "PDF, PNG, JPEG, Word")}{" "}
        · up to {maxSizeMb ?? 10} MB
      </p>
    </form>
  );
}

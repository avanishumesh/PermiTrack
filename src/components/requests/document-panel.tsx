import { Download, FileText, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UploadDocumentForm } from "@/components/requests/upload-document-form";
import { VerifyDocumentForm } from "@/components/requests/verify-document-form";
import type { RequestDocument, RequiredDocumentType } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const STATUS_LABEL: Record<RequestDocument["verification_status"], string> = {
  PENDING: "Not verified",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

const STATUS_VARIANT: Record<RequestDocument["verification_status"], "muted" | "success" | "danger"> = {
  PENDING: "muted",
  VERIFIED: "success",
  REJECTED: "danger",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentRow({
  document,
  signedUrl,
  requestId,
  canVerify,
  canUpload,
  label,
  acceptedMimeTypes,
  maxSizeMb,
}: {
  document: RequestDocument;
  signedUrl?: string;
  requestId: string;
  canVerify: boolean;
  canUpload: boolean;
  label?: string | null;
  acceptedMimeTypes?: string[];
  maxSizeMb?: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{document.file_name}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {label ? `${label} · ` : ""}v{document.version} · {formatSize(document.size_bytes)} ·
            uploaded {formatDate(document.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[document.verification_status]}>
            {STATUS_LABEL[document.verification_status]}
          </Badge>
          {signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <Download className="h-3.5 w-3.5" /> Open
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">Link unavailable</span>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Signed links expire after 5 minutes. Replacements create a new version and keep the history.
      </p>

      <div className="flex flex-wrap items-start gap-4">
        {canVerify ? (
          <VerifyDocumentForm
            requestId={requestId}
            documentId={document.id}
            status={document.verification_status}
          />
        ) : null}
        {canUpload ? (
          <UploadDocumentForm
            requestId={requestId}
            documentTypeId={document.required_document_type_id}
            replacesDocumentId={document.id}
            label="Replace with a new version"
            acceptedMimeTypes={acceptedMimeTypes}
            maxSizeMb={maxSizeMb}
          />
        ) : null}
      </div>
    </div>
  );
}

export function DocumentPanel({
  requestId,
  requiredDocumentTypes,
  documents,
  signedUrls,
  canUpload,
  canVerify,
  locked,
}: {
  requestId: string;
  requiredDocumentTypes: RequiredDocumentType[];
  documents: RequestDocument[];
  signedUrls: Record<string, string>;
  canUpload: boolean;
  canVerify: boolean;
  locked: boolean;
}) {
  const current = documents.filter((document) => !document.replaced_by);
  const byType = new Map<string, RequestDocument>();
  for (const document of current) {
    if (document.required_document_type_id) {
      byType.set(document.required_document_type_id, document);
    }
  }
  const supplementary = current.filter((document) => !document.required_document_type_id);
  const historical = documents.filter((document) => document.replaced_by);

  return (
    <div className="space-y-4">
      {requiredDocumentTypes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This permission type has no required documents.
        </p>
      ) : (
        <div className="space-y-3">
          {requiredDocumentTypes.map((type) => {
            const document = byType.get(type.id);
            const missing = type.is_required && !document;

            return (
              <div key={type.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{type.name}</p>
                  {type.is_required ? (
                    <Badge variant="outline">Required</Badge>
                  ) : (
                    <Badge variant="muted">Optional</Badge>
                  )}
                  {missing ? <Badge variant="danger">Missing</Badge> : null}
                  {document?.verification_status === "VERIFIED" ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                      <ShieldCheck className="h-3 w-3" /> Verified
                    </span>
                  ) : null}
                </div>
                {type.description ? (
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                ) : null}

                {document ? (
                  <DocumentRow
                    document={document}
                    signedUrl={signedUrls[document.storage_path]}
                    requestId={requestId}
                    canVerify={canVerify}
                    canUpload={canUpload}
                    acceptedMimeTypes={type.accepted_mime_types}
                    maxSizeMb={type.max_size_mb}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                    Nothing uploaded yet.
                    {canUpload && !locked ? (
                      <div className="mt-2">
                        <UploadDocumentForm
                          requestId={requestId}
                          documentTypeId={type.id}
                          documentName={type.name}
                          acceptedMimeTypes={type.accepted_mime_types}
                          maxSizeMb={type.max_size_mb}
                          label={`Upload ${type.name}`}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {supplementary.length > 0 ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Supplementary files
          </p>
          {supplementary.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              signedUrl={signedUrls[document.storage_path]}
              requestId={requestId}
              canVerify={canVerify}
              canUpload={canUpload}
            />
          ))}
        </div>
      ) : null}

      {canUpload && !locked ? (
        <div className="rounded-lg border border-dashed p-3">
          <UploadDocumentForm
            requestId={requestId}
            label="Add a supplementary file (no document requirement)"
          />
        </div>
      ) : null}

      {locked ? (
        <p className="text-xs text-muted-foreground">
          Uploads are closed because this request is no longer open for changes.
        </p>
      ) : null}

      {historical.length > 0 ? (
        <details className="rounded-lg border bg-muted/30 p-3">
          <summary className="cursor-pointer text-xs font-medium">
            Replaced versions ({historical.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {historical.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  v{document.version} · {document.file_name} · {formatDate(document.created_at)}
                </span>
                {signedUrls[document.storage_path] ? (
                  <a
                    href={signedUrls[document.storage_path]}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    Open
                  </a>
                ) : (
                  <span className="text-muted-foreground">Unavailable</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

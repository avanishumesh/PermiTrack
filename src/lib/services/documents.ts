import "server-only";
import { AppError, mapDbError } from "@/lib/errors";
import { ALLOWED_MIME_TYPES, MAX_DOCUMENT_BYTES } from "@/lib/constants";
import { callRpc, createClient } from "@/lib/supabase/server";
import { demoActor, demoUploadDocument, getDemoSession, isDemoId } from "@/lib/demo";
import { safeFileName } from "@/lib/utils";

export const DOCUMENT_BUCKET = "private-documents";
/** Signed URLs are short lived by design (five minutes). */
export const SIGNED_URL_TTL_SECONDS = 300;

const MIME_LABELS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/jpg": "JPEG",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
};

function startsWith(bytes: Uint8Array, signature: number[]) {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Content sniffing. Browsers can lie about `file.type`, so the declared MIME
 * type must be corroborated by the file's magic bytes.
 */
export function detectMimeType(bytes: Uint8Array, fileName: string): string | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return "application/msword";
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) {
    // ZIP container: only acceptable as an Office Open XML document.
    return fileName.toLowerCase().endsWith(".docx")
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : null;
  }
  return null;
}

function normaliseMime(mime: string) {
  const lower = mime.toLowerCase();
  return lower === "image/jpg" ? "image/jpeg" : lower;
}

interface DocumentType {
  id: string;
  name: string;
  accepted_mime_types: string[];
  max_size_mb: number;
  is_required: boolean;
}

export interface UploadDocumentResult {
  documentId: string;
  version: number;
}

export async function uploadRequestDocument(input: {
  requestId: string;
  documentTypeId: string | null;
  file: File;
  replacesDocumentId?: string | null;
}): Promise<UploadDocumentResult> {
  const { requestId, documentTypeId, file, replacesDocumentId } = input;

  // Demo mode keeps metadata in memory (no real storage) so the two demo
  // roles can upload, replace and verify documents end to end.
  if ((await getDemoSession().catch(() => null)) || isDemoId(requestId)) {
    if (!file || typeof file.arrayBuffer !== "function" || file.size <= 0) {
      throw new AppError("PT422", "Choose a file to upload.", 422);
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new AppError("PT422", "File is too large. Maximum size is 10 MB.", 422);
    }
    return demoUploadDocument({
      requestId,
      documentTypeId,
      fileName: file.name.slice(0, 255),
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      replacesDocumentId,
    });
  }

  const supabase = await createClient();

  if (!file || typeof file.arrayBuffer !== "function") {
    throw new AppError("PT422", "Choose a file to upload.", 422);
  }
  if (file.size <= 0) {
    throw new AppError("PT422", "The selected file is empty.", 422);
  }

  let documentType: DocumentType | null = null;
  if (documentTypeId) {
    const { data, error } = await supabase
      .from("required_document_types")
      .select("id, name, accepted_mime_types, max_size_mb, is_required")
      .eq("id", documentTypeId)
      .maybeSingle();

    if (error) throw mapDbError(error);
    if (!data) throw new AppError("PT404", "Document type not found.", 404);
    documentType = data as DocumentType;
  }

  const accepted = (documentType?.accepted_mime_types?.length
    ? documentType.accepted_mime_types
    : [...ALLOWED_MIME_TYPES]
  ).map(normaliseMime);

  const maxBytes = documentType ? documentType.max_size_mb * 1024 * 1024 : MAX_DOCUMENT_BYTES;
  if (file.size > maxBytes) {
    throw new AppError(
      "PT422",
      `File is too large. Maximum size is ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
      422
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const declared = normaliseMime(file.type || "");
  const detected = detectMimeType(bytes, file.name);

  if (!detected) {
    throw new AppError(
      "PT422",
      "Unsupported file. Upload a PDF, PNG, JPEG or Word document.",
      422
    );
  }
  if (!accepted.includes(normaliseMime(detected))) {
    throw new AppError(
      "PT422",
      `${MIME_LABELS[detected] ?? "This"} files are not accepted for this document.`,
      422
    );
  }
  if (declared && declared !== normaliseMime(detected)) {
    throw new AppError("PT422", "The file content does not match its declared type.", 422);
  }

  // Find the next version for this document slot.
  let version = 1;
  if (replacesDocumentId) {
    const { data: previous, error } = await supabase
      .from("request_documents")
      .select("id, version, required_document_type_id, replaced_by")
      .eq("id", replacesDocumentId)
      .eq("request_id", requestId)
      .maybeSingle();

    if (error) throw mapDbError(error);
    if (!previous) throw new AppError("PT404", "Document to replace was not found.", 404);
    if (previous.replaced_by) {
      throw new AppError("PT409", "This document has already been replaced.", 409);
    }
    version = previous.version + 1;
  } else {
    let query = supabase
      .from("request_documents")
      .select("version")
      .eq("request_id", requestId)
      .order("version", { ascending: false })
      .limit(1);

    query = documentTypeId
      ? query.eq("required_document_type_id", documentTypeId)
      : query.is("required_document_type_id", null);

    const { data, error } = await query.maybeSingle();
    if (error) throw mapDbError(error);
    version = (data?.version ?? 0) + 1;
  }

  const folder = documentTypeId ?? "supplementary";
  const fileName = `${Date.now()}-${safeFileName(file.name || "document")}`;
  const storagePath = `requests/${requestId}/${folder}/v${version}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, bytes, {
      contentType: detected,
      cacheControl: "private, max-age=0",
      upsert: false,
    });

  if (uploadError) {
    throw new AppError("UPLOAD_FAILED", "The file could not be stored. Please try again.", 400);
  }

  try {
    const result = await callRpc<{ ok: boolean; documentId: string; version: number }>(
      "api_register_document",
      {
        p_request_id: requestId,
        p_required_document_type_id: documentTypeId,
        p_file_name: file.name.slice(0, 255),
        p_mime_type: detected,
        p_size_bytes: file.size,
        p_storage_path: storagePath,
        p_replaces_document_id: replacesDocumentId ?? null,
      }
    );

    return { documentId: result.documentId, version: result.version };
  } catch (error) {
    // Roll back the orphaned object so storage and the database stay in sync.
    await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    throw mapDbError(error);
  }
}

export async function getDocumentSignedUrl(storagePath: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new AppError("PT404", "The document is unavailable.", 404);
  }
  return data.signedUrl;
}

export async function getDocumentSignedUrls(storagePaths: string[]) {
  if (storagePaths.length === 0) return {} as Record<string, string>;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);

  if (error) throw mapDbError(error);
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

/** Admin-only cleanup used when an upload fails after auth user validation. */
export async function removeStoredObject(storagePath: string) {
  const supabase = await createClient();
  await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
}

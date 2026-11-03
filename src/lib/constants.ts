import type { RequestStatus, StageStatus } from "@/lib/types";

export const ROLE_LABELS: Record<string, string> = {
  student: "Student",
  faculty_guide: "Faculty guide",
  department_head: "Department head",
  lab_manager: "Lab manager",
  dean: "Dean",
  admin: "Administrator",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  CHANGES_REQUESTED: "Changes requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const STAGE_STATUS_LABELS: Record<StageStatus, string> = {
  PENDING: "Pending",
  ACTIVE: "In review",
  WAITING_STUDENT: "Waiting on student",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SKIPPED: "Skipped",
  INVALIDATED: "Needs re-approval",
};

export const REQUEST_STATUS_CLASSES: Record<RequestStatus, string> = {
  DRAFT: "border-slate-300 bg-slate-100 text-slate-700",
  SUBMITTED: "border-sky-200 bg-sky-50 text-sky-700",
  UNDER_REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
  CHANGES_REQUESTED: "border-orange-200 bg-orange-50 text-orange-800",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-700",
  WITHDRAWN: "border-slate-300 bg-slate-100 text-slate-600",
};

export const STAGE_STATUS_CLASSES: Record<StageStatus, string> = {
  PENDING: "border-slate-200 bg-slate-50 text-slate-600",
  ACTIVE: "border-amber-200 bg-amber-50 text-amber-800",
  WAITING_STUDENT: "border-orange-200 bg-orange-50 text-orange-800",
  APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REJECTED: "border-rose-200 bg-rose-50 text-rose-700",
  SKIPPED: "border-slate-200 bg-slate-50 text-slate-500",
  INVALIDATED: "border-violet-200 bg-violet-50 text-violet-700",
};

export const APPROVER_TYPE_LABELS: Record<string, string> = {
  PROJECT_FACULTY_GUIDE: "Project faculty guide",
  DEPARTMENT_HEAD: "Department head",
  ROLE: "Role holder",
  USER: "Specific user",
  LAB_MANAGER: "Lab manager",
  DEAN: "Dean",
  CUSTOM: "Custom (role or user)",
};

export const ACTION_LABELS: Record<string, string> = {
  SUBMIT_REQUEST: "Submitted request",
  APPROVE_STAGE: "Approved stage",
  REJECT_REQUEST: "Rejected request",
  REQUEST_CHANGES: "Requested changes",
  ASK_QUERY: "Asked a question",
  ANSWER_QUERY: "Answered a question",
  RESUBMIT_REQUEST: "Resubmitted request",
  EDIT_REQUEST_BY_AUTHORITY: "Edited request",
  UPLOAD_DOCUMENT: "Uploaded document",
  REPLACE_DOCUMENT: "Replaced document",
  FORWARD_STAGE: "Forwarded stage",
  DELEGATE_STAGE: "Delegated stage",
  WITHDRAW_REQUEST: "Withdrew request",
  ISSUE_FINAL_PERMISSION: "Issued final permission",
};

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const STAFF_ROLES = [
  "faculty_guide",
  "department_head",
  "lab_manager",
  "dean",
  "admin",
] as const;

export const NOTIFICATION_ICONS: Record<string, string> = {
  NEW_APPROVAL_TASK: "inbox",
  REQUEST_APPROVED: "check",
  REQUEST_REJECTED: "x",
  CHANGES_REQUESTED: "alert",
  NEW_QUERY: "message",
  QUERY_ANSWERED: "message",
  REQUEST_SUBMITTED: "send",
  RESUBMISSION_RECEIVED: "send",
  REAPPROVAL_REQUIRED: "alert",
  MISSING_APPROVER: "alert",
  DOCUMENT_UPDATED: "file",
  STAGE_DELEGATED: "users",
};

export type RequestStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";

export type StageStatus =
  | "PENDING"
  | "ACTIVE"
  | "WAITING_STUDENT"
  | "APPROVED"
  | "REJECTED"
  | "SKIPPED"
  | "INVALIDATED";

export type ActionType =
  | "SUBMIT_REQUEST"
  | "APPROVE_STAGE"
  | "REJECT_REQUEST"
  | "REQUEST_CHANGES"
  | "ASK_QUERY"
  | "ANSWER_QUERY"
  | "RESUBMIT_REQUEST"
  | "EDIT_REQUEST_BY_AUTHORITY"
  | "UPLOAD_DOCUMENT"
  | "REPLACE_DOCUMENT"
  | "FORWARD_STAGE"
  | "DELEGATE_STAGE"
  | "WITHDRAW_REQUEST"
  | "ISSUE_FINAL_PERMISSION";

export interface Profile {
  id: string;
  name: string;
  email: string;
  department_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  name: string;
  parent_id: string | null;
  head_user_id: string | null;
  created_at: string;
  updated_at?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  department_id: string | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  roles: { name: string } | { name: string }[] | null;
}

export interface Project {
  id: string;
  title: string;
  description: string | null;
  department_id: string;
  created_by: string;
  faculty_guide_id: string | null;
  category: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: string;
  added_at: string;
}

export interface FormOption {
  value: string;
  label: string;
}

export interface FieldCondition {
  field?: string;
  equals?: unknown;
  not_equals?: unknown;
  in?: unknown[];
  exists?: boolean;
  all?: FieldCondition[];
  any?: FieldCondition[];
}

export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "date"
  | "datetime"
  | "number"
  | "select"
  | "multiselect"
  | "checkbox";

export interface FormField {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  material?: boolean;
  options?: FormOption[];
  placeholder?: string;
  help?: string;
  visible_if?: FieldCondition;
}

export interface FormSchema {
  fields: FormField[];
}

export interface PermissionType {
  id: string;
  name: string;
  description: string | null;
  department_id: string | null;
  is_active: boolean;
  form_schema: FormSchema;
  eligibility_rules: unknown;
  created_at: string;
  updated_at: string;
}

export interface RequiredDocumentType {
  id: string;
  permission_type_id: string;
  name: string;
  description: string | null;
  is_required: boolean;
  accepted_mime_types: string[];
  max_size_mb: number;
  created_at: string;
}

export interface WorkflowTemplate {
  id: string;
  permission_type_id: string;
  name: string;
  version: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStage {
  id: string;
  template_id: string;
  sequence: number;
  name: string;
  approver_type:
    | "PROJECT_FACULTY_GUIDE"
    | "DEPARTMENT_HEAD"
    | "ROLE"
    | "USER"
    | "LAB_MANAGER"
    | "DEAN"
    | "CUSTOM";
  approver_role_id: string | null;
  approver_user_id: string | null;
  department_scope: string;
  can_edit_fields: string[];
  invalidates_on: string[];
  sla_hours: number | null;
  conditions: FieldCondition | null;
}

export interface PermissionRequest {
  id: string;
  project_id: string;
  permission_type_id: string;
  workflow_template_id: string | null;
  created_by: string;
  status: RequestStatus;
  current_stage_id: string | null;
  form_data: Record<string, unknown>;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  withdrawn_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  issued_conditions: unknown;
  created_at: string;
  updated_at: string;
}

export interface RequestStageState {
  id: string;
  request_id: string;
  stage_id: string;
  sequence: number;
  status: StageStatus;
  assigned_approver_id: string | null;
  delegated_from_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  due_at: string | null;
  decision_comment: string | null;
  updated_at: string;
  workflow_stages?: WorkflowStage | null;
}

export interface ApprovalAction {
  id: string;
  request_id: string;
  stage_id: string | null;
  stage_state_id: string | null;
  actor_id: string;
  action: ActionType;
  from_status: string | null;
  to_status: string | null;
  comment: string | null;
  is_internal: boolean;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface RequestDocument {
  id: string;
  request_id: string;
  required_document_type_id: string | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  version: number;
  verification_status: "PENDING" | "VERIFIED" | "REJECTED";
  uploaded_by: string;
  replaced_by: string | null;
  created_at: string;
}

export interface RequestRevision {
  id: string;
  request_id: string;
  actor_id: string;
  revision_type:
    | "STUDENT_EDIT"
    | "STUDENT_RESUBMISSION"
    | "AUTHORITY_EDIT"
    | "DOCUMENT_REPLACEMENT"
    | "WORKFLOW_REVALIDATION";
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface QueryRow {
  id: string;
  request_id: string;
  stage_id: string | null;
  asked_by: string;
  responded_by: string | null;
  question: string;
  response: string | null;
  status: "OPEN" | "RESOLVED" | "CLOSED";
  is_blocking: boolean;
  created_at: string;
  responded_at: string | null;
  resolved_at: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  request_id: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Viewer {
  user: { id: string; email?: string };
  profile: Profile;
  roles: string[];
  isAdmin: boolean;
  isStaff: boolean;
  departmentName: string | null;
}

export type ActionName =
  | "APPROVE_STAGE"
  | "REJECT_REQUEST"
  | "REQUEST_CHANGES"
  | "ASK_QUERY"
  | "ANSWER_QUERY"
  | "RESUBMIT_REQUEST"
  | "EDIT_REQUEST_BY_AUTHORITY"
  | "FORWARD_STAGE"
  | "DELEGATE_STAGE"
  | "WITHDRAW_REQUEST";

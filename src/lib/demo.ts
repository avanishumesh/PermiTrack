import "server-only";
import { cookies } from "next/headers";
import { AppError } from "@/lib/errors";
import type {
  FormSchema,
  PermissionRequest,
  PermissionType,
  QueryRow,
  RequestDocument,
} from "@/lib/types";
import type { RequestSummary } from "@/lib/services/requests";

/**
 * Interactive offline demo backend.
 *
 * A demo "session" is a cookie (`pt_demo_role=student|admin`). While it is
 * present, the service layer reads and writes a shared in-memory store
 * instead of Postgres, so the two demo roles genuinely interact:
 *
 *   student submits a request  →  it appears in the admin inbox
 *   admin approves / asks      →  the student sees the decision + notification
 *
 * State lives in `globalThis`, so both roles (and any browser) share it until
 * the dev server restarts. This is for evaluation only — never production data.
 */

export const DEMO_COOKIE_NAME = "pt_demo_role";
export type DemoRole = "student" | "admin";

/** All demo ids are valid UUIDs so action validators accept them. */
function demoUuid(n: number): string {
  return `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const DEMO_IDS = {
  student: demoUuid(1),
  admin: demoUuid(2),
  guide: demoUuid(3),
  head: demoUuid(4),
  lab: demoUuid(5),
  dean: demoUuid(6),
  deptCS: demoUuid(10),
  permissionType: demoUuid(11),
  reqLetter: demoUuid(12),
  reqSafety: demoUuid(13),
  template: demoUuid(14),
  project1: demoUuid(20),
  project2: demoUuid(21),
  req1: demoUuid(30),
  req2: demoUuid(31),
  req3: demoUuid(32),
  req4: demoUuid(33),
  stageGuide: demoUuid(50),
  stageLab: demoUuid(51),
  stageHead: demoUuid(52),
  stageDean: demoUuid(53),
} as const;

export function isDemoId(id: string | null | undefined) {
  return typeof id === "string" && id.startsWith("d0000000-");
}

/** Kept for existing call sites. */
export function isDemoViewerId(id: string | null | undefined) {
  return isDemoId(id);
}

export function isDemoRole(value: unknown): value is DemoRole {
  return value === "student" || value === "admin";
}

export async function getDemoSession(): Promise<DemoRole | null> {
  try {
    const store = await cookies();
    const value = store.get(DEMO_COOKIE_NAME)?.value;
    return isDemoRole(value) ? value : null;
  } catch {
    return null;
  }
}

const DEMO_PEOPLE: Record<string, { name: string; email: string; roles: string[] }> = {
  [DEMO_IDS.student]: { name: "Demo Student", email: "student.demo@permittrack.local", roles: ["student"] },
  [DEMO_IDS.admin]: { name: "Demo Admin", email: "admin.demo@permittrack.local", roles: ["admin"] },
  [DEMO_IDS.guide]: { name: "Grace Guide", email: "guide.demo@permittrack.local", roles: ["faculty_guide"] },
  [DEMO_IDS.head]: { name: "Hassan Head", email: "head.demo@permittrack.local", roles: ["department_head"] },
  [DEMO_IDS.lab]: { name: "Lena Labmanager", email: "lab.demo@permittrack.local", roles: ["lab_manager"] },
  [DEMO_IDS.dean]: { name: "Dana Dean", email: "dean.demo@permittrack.local", roles: ["dean"] },
};

export async function demoActor(): Promise<{ id: string; name: string; isAdmin: boolean }> {
  // Test hook: lets scripts/simulations act as a chosen demo role outside a request.
  const testRole = process.env.PERMITRACK_DEMO_TEST_ROLE;
  const role = isDemoRole(testRole) ? testRole : await getDemoSession();
  if (role === "admin") return { id: DEMO_IDS.admin, name: "Demo Admin", isAdmin: true };
  return { id: DEMO_IDS.student, name: "Demo Student", isAdmin: false };
}

const nowIso = () => new Date().toISOString();
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
const daysAhead = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const hoursAhead = (from: string, hours: number) =>
  new Date(new Date(from).getTime() + hours * 3_600_000).toISOString();

export const DEMO_FORM_SCHEMA: FormSchema = {
  fields: [
    { key: "equipment_name", label: "Equipment or facility", type: "text", required: true, material: true },
    { key: "purpose", label: "Purpose of access", type: "textarea", required: true, material: true },
    {
      key: "risk_level",
      label: "Risk level",
      type: "select",
      required: true,
      material: true,
      options: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
    },
    { key: "lab_room", label: "Lab room", type: "text", required: true },
    { key: "start_date", label: "Access from", type: "date", required: true },
    { key: "end_date", label: "Access until", type: "date", required: true, material: true },
    { key: "needs_supervision", label: "Requires staff supervision", type: "checkbox" },
    {
      key: "supervision_notes",
      label: "Supervision arrangements",
      type: "textarea",
      visible_if: { field: "needs_supervision", equals: true },
    },
  ],
};

const MATERIAL_FIELDS = DEMO_FORM_SCHEMA.fields.filter((f) => f.material).map((f) => f.key);

interface DemoStageDef {
  defId: string;
  name: string;
  approverId: string;
  slaHours: number;
  canEdit: string[];
  invalidates: string[];
  condition: { field: string; equals: unknown } | null;
}

const STAGE_DEFS: DemoStageDef[] = [
  { defId: DEMO_IDS.stageGuide, name: "Faculty guide review", approverId: DEMO_IDS.guide, slaHours: 72, canEdit: ["purpose", "end_date"], invalidates: ["equipment_name", "risk_level"], condition: null },
  { defId: DEMO_IDS.stageLab, name: "Lab manager clearance", approverId: DEMO_IDS.lab, slaHours: 48, canEdit: ["lab_room"], invalidates: [], condition: null },
  { defId: DEMO_IDS.stageHead, name: "Department head approval", approverId: DEMO_IDS.head, slaHours: 96, canEdit: [], invalidates: ["equipment_name", "start_date", "end_date", "risk_level"], condition: null },
  { defId: DEMO_IDS.stageDean, name: "Dean review (high risk only)", approverId: DEMO_IDS.dean, slaHours: 120, canEdit: [], invalidates: ["risk_level"], condition: { field: "risk_level", equals: "high" } },
];

export interface DemoStageState {
  id: string;
  requestId: string;
  defId: string;
  sequence: number;
  name: string;
  status: string;
  assigneeId: string | null;
  delegatedFrom: string | null;
  startedAt: string | null;
  completedAt: string | null;
  dueAt: string | null;
  comment: string | null;
  canEdit: string[];
  invalidates: string[];
  condition: { field: string; equals: unknown } | null;
}

export interface DemoRequest {
  id: string;
  projectId: string;
  projectTitle: string;
  permissionTypeId: string;
  permissionTypeName: string;
  templateId: string;
  createdBy: string;
  status: string;
  currentStageId: string | null;
  formData: Record<string, unknown>;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  withdrawnAt: string | null;
  validFrom: string | null;
  createdAt: string;
  updatedAt: string;
  stages: DemoStageState[];
  actions: Array<Record<string, any>>;
  queries: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
  revisions: Array<Record<string, any>>;
}

export interface DemoNotification {
  id: string;
  userId: string;
  requestId: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DemoProject {
  id: string;
  title: string;
  description: string | null;
  department_id: string;
  department_name: string;
  category: string | null;
  status: string;
  created_by: string;
  created_by_name: string;
  faculty_guide_id: string | null;
  faculty_guide_name: string | null;
  member_count: number;
  request_count: number;
  created_at: string;
  updated_at: string;
  members: Array<{ user_id: string; role: string; added_at: string }>;
}

interface DemoStore {
  seeded: boolean;
  seq: number;
  requests: DemoRequest[];
  notifications: DemoNotification[];
  projects: DemoProject[];
}

declare global {
  // eslint-disable-next-line no-var
  var __permitrack_demo: DemoStore | undefined;
}

function nextId(store: DemoStore): string {
  store.seq += 1;
  return demoUuid(1000 + store.seq);
}

function personName(id: string | null): string {
  if (!id) return "—";
  return DEMO_PEOPLE[id]?.name ?? "Demo user";
}

function notify(
  store: DemoStore,
  userId: string,
  input: { requestId?: string | null; type: string; title: string; body: string; link?: string | null }
) {
  store.notifications.unshift({
    id: nextId(store),
    userId,
    requestId: input.requestId ?? null,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    readAt: null,
    createdAt: nowIso(),
  });
}

function logAction(
  store: DemoStore,
  request: DemoRequest,
  input: {
    actorId: string;
    action: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    comment?: string | null;
    isInternal?: boolean;
    stageId?: string | null;
    stageStateId?: string | null;
    payload?: Record<string, unknown> | null;
  }
) {
  const row = {
    id: nextId(store),
    request_id: request.id,
    stage_id: input.stageId ?? null,
    stage_state_id: input.stageStateId ?? null,
    actor_id: input.actorId,
    action: input.action,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    comment: input.comment ?? null,
    is_internal: input.isInternal ?? false,
    payload: input.payload ?? null,
    created_at: nowIso(),
  };
  request.actions.unshift(row);
  return row;
}

function buildStages(requestId: string, baseSeq = 0): DemoStageState[] {
  return STAGE_DEFS.map((def, index) => ({
    id: demoUuid(400 + baseSeq + index),
    requestId,
    defId: def.defId,
    sequence: index + 1,
    name: def.name,
    status: "PENDING",
    assigneeId: null,
    delegatedFrom: null,
    startedAt: null,
    completedAt: null,
    dueAt: null,
    comment: null,
    canEdit: def.canEdit,
    invalidates: def.invalidates,
    condition: def.condition,
  }));
}

function stageConditionMet(stage: DemoStageState, formData: Record<string, unknown>): boolean {
  if (!stage.condition) return true;
  return String(formData[stage.condition.field] ?? "") === String(stage.condition.equals);
}

function activateStage(store: DemoStore, request: DemoRequest, stage: DemoStageState, actorId: string) {
  stage.status = "ACTIVE";
  const def = STAGE_DEFS.find((d) => d.defId === stage.defId)!;
  stage.assigneeId = def.approverId;
  stage.delegatedFrom = null;
  stage.startedAt = nowIso();
  stage.dueAt = hoursAhead(stage.startedAt, def.slaHours);
  stage.completedAt = null;
  request.currentStageId = stage.id;
  request.updatedAt = nowIso();
  logAction(store, request, {
    actorId,
    action: "SUBMIT_REQUEST",
    stageId: stage.defId,
    stageStateId: stage.id,
    toStatus: "UNDER_REVIEW",
  });
}

function advanceAfter(
  store: DemoStore,
  request: DemoRequest,
  fromSequence: number,
  actorId: string
): DemoStageState | null {
  const next = request.stages
    .filter((s) => s.sequence > fromSequence && s.status !== "SKIPPED")
    .sort((a, b) => a.sequence - b.sequence);
  for (const candidate of next) {
    if (!stageConditionMet(candidate, request.formData)) {
      candidate.status = "SKIPPED";
      candidate.completedAt = nowIso();
      continue;
    }
    activateStage(store, request, candidate, actorId);
    return candidate;
  }
  request.currentStageId = null;
  request.updatedAt = nowIso();
  return null;
}

function seedStore(): DemoStore {
  const store: DemoStore = { seeded: true, seq: 0, requests: [], notifications: [], projects: [] };

  store.projects.push(
    {
      id: DEMO_IDS.project1,
      title: "Autonomous Drone Lab",
      description: "Vision-guided drone for campus delivery research.",
      department_id: DEMO_IDS.deptCS,
      department_name: "Computer Science",
      category: "Research",
      status: "ACTIVE",
      created_by: DEMO_IDS.student,
      created_by_name: "Demo Student",
      faculty_guide_id: DEMO_IDS.guide,
      faculty_guide_name: "Grace Guide",
      member_count: 3,
      request_count: 3,
      created_at: daysAgo(60),
      updated_at: daysAgo(1),
      members: [
        { user_id: DEMO_IDS.student, role: "OWNER", added_at: daysAgo(60) },
        { user_id: DEMO_IDS.guide, role: "FACULTY_GUIDE", added_at: daysAgo(60) },
        { user_id: DEMO_IDS.admin, role: "MEMBER", added_at: daysAgo(59) },
      ],
    },
    {
      id: DEMO_IDS.project2,
      title: "Solar Car Telemetry",
      description: "Live telemetry dashboard for the solar car team.",
      department_id: DEMO_IDS.deptCS,
      department_name: "Computer Science",
      category: "Competition",
      status: "ACTIVE",
      created_by: DEMO_IDS.student,
      created_by_name: "Demo Student",
      faculty_guide_id: DEMO_IDS.guide,
      faculty_guide_name: "Grace Guide",
      member_count: 2,
      request_count: 1,
      created_at: daysAgo(90),
      updated_at: daysAgo(20),
      members: [
        { user_id: DEMO_IDS.student, role: "OWNER", added_at: daysAgo(90) },
        { user_id: DEMO_IDS.guide, role: "FACULTY_GUIDE", added_at: daysAgo(90) },
      ],
    }
  );

  const baseForm = {
    equipment_name: "Robotics Lab — soldering station",
    purpose: "Build and test the flight-controller harness for the autonomous drone project.",
    risk_level: "medium",
    lab_room: "ENG-214",
    start_date: daysAgo(-7).slice(0, 10),
    end_date: daysAgo(-90).slice(0, 10),
    needs_supervision: true,
    supervision_notes: "A lab technician is present on weekday afternoons.",
  };

  const mkRequest = (input: {
    id: string;
    projectId: string;
    projectTitle: string;
    status: string;
    formData: Record<string, unknown>;
    createdDaysAgo: number;
    updatedDaysAgo: number;
    submittedDaysAgo: number | null;
  }): DemoRequest => ({
    id: input.id,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    permissionTypeId: DEMO_IDS.permissionType,
    permissionTypeName: "Lab Equipment Access",
    templateId: DEMO_IDS.template,
    createdBy: DEMO_IDS.student,
    status: input.status,
    currentStageId: null,
    formData: input.formData,
    submittedAt: input.submittedDaysAgo === null ? null : daysAgo(input.submittedDaysAgo),
    approvedAt: null,
    rejectedAt: null,
    withdrawnAt: null,
    validFrom: null,
    createdAt: daysAgo(input.createdDaysAgo),
    updatedAt: daysAgo(input.updatedDaysAgo),
    stages: buildStages(input.id),
    actions: [],
    queries: [],
    documents: [],
    revisions: [],
  });

  const addDoc = (request: DemoRequest, name: string, typeId: string, verification: string, version = 1) => {
    request.documents.push({
      id: nextId(store),
      request_id: request.id,
      required_document_type_id: typeId,
      file_name: name,
      mime_type: "application/pdf",
      size_bytes: 48_000,
      storage_path: `demo/${request.id}/${typeId}/v${version}`,
      version,
      verification_status: verification,
      uploaded_by: DEMO_IDS.student,
      replaced_by: null,
      created_at: request.createdAt,
    });
  };

  // req1: under review at stage 3, first two stages approved.
  const req1 = mkRequest({ id: DEMO_IDS.req1, projectId: DEMO_IDS.project1, projectTitle: "Autonomous Drone Lab", status: "UNDER_REVIEW", formData: { ...baseForm }, createdDaysAgo: 6, updatedDaysAgo: 1, submittedDaysAgo: 5 });
  const [r1s1, r1s2, r1s3] = req1.stages;
  for (const [stage, days] of [[r1s1, 4], [r1s2, 2]] as const) {
    stage.status = "APPROVED";
    stage.assigneeId = STAGE_DEFS[stage.sequence - 1].approverId;
    stage.startedAt = daysAgo(days + 1);
    stage.completedAt = daysAgo(days);
    stage.dueAt = hoursAhead(stage.startedAt, STAGE_DEFS[stage.sequence - 1].slaHours);
  }
  r1s3.status = "ACTIVE";
  r1s3.assigneeId = DEMO_IDS.head;
  r1s3.startedAt = daysAgo(1);
  r1s3.dueAt = daysAhead(2);
  req1.currentStageId = r1s3.id;
  addDoc(req1, "Guide approval letter.pdf", DEMO_IDS.reqLetter, "VERIFIED");
  addDoc(req1, "Lab safety certificate.pdf", DEMO_IDS.reqSafety, "PENDING");
  logAction(store, req1, { actorId: DEMO_IDS.student, action: "SUBMIT_REQUEST", toStatus: "UNDER_REVIEW" });

  // req2: changes requested by the guide.
  const req2 = mkRequest({ id: DEMO_IDS.req2, projectId: DEMO_IDS.project1, projectTitle: "Autonomous Drone Lab", status: "CHANGES_REQUESTED", formData: { ...baseForm, purpose: "Line-following robot for the showcase." }, createdDaysAgo: 12, updatedDaysAgo: 2, submittedDaysAgo: 11 });
  const [r2s1] = req2.stages;
  r2s1.status = "ACTIVE";
  r2s1.assigneeId = DEMO_IDS.guide;
  r2s1.startedAt = daysAgo(11);
  r2s1.dueAt = daysAhead(1);
  req2.currentStageId = r2s1.id;
  addDoc(req2, "Guide approval letter.pdf", DEMO_IDS.reqLetter, "PENDING");
  addDoc(req2, "Lab safety certificate.pdf", DEMO_IDS.reqSafety, "PENDING");
  logAction(store, req2, { actorId: DEMO_IDS.guide, action: "REQUEST_CHANGES", stageId: DEMO_IDS.stageGuide, stageStateId: r2s1.id, fromStatus: "UNDER_REVIEW", toStatus: "CHANGES_REQUESTED", comment: "Please expand the purpose statement with the exact tasks." });

  // req3: fully approved.
  const req3 = mkRequest({ id: DEMO_IDS.req3, projectId: DEMO_IDS.project2, projectTitle: "Solar Car Telemetry", status: "APPROVED", formData: { ...baseForm, risk_level: "low", lab_room: "ENG-101" }, createdDaysAgo: 30, updatedDaysAgo: 20, submittedDaysAgo: 29 });
  for (const stage of req3.stages) {
    if (!stageConditionMet(stage, req3.formData)) {
      stage.status = "SKIPPED";
      stage.completedAt = daysAgo(21);
      continue;
    }
    stage.status = "APPROVED";
    stage.assigneeId = STAGE_DEFS[stage.sequence - 1].approverId;
    stage.startedAt = daysAgo(24);
    stage.completedAt = daysAgo(20);
  }
  req3.approvedAt = daysAgo(20);
  req3.validFrom = daysAgo(20);
  addDoc(req3, "Guide approval letter.pdf", DEMO_IDS.reqLetter, "VERIFIED");
  addDoc(req3, "Lab safety certificate.pdf", DEMO_IDS.reqSafety, "VERIFIED");
  logAction(store, req3, { actorId: DEMO_IDS.head, action: "APPROVE_STAGE", toStatus: "APPROVED", comment: "All clear." });

  // req4: fresh draft.
  const req4 = mkRequest({ id: DEMO_IDS.req4, projectId: DEMO_IDS.project1, projectTitle: "Autonomous Drone Lab", status: "DRAFT", formData: {}, createdDaysAgo: 1, updatedDaysAgo: 0, submittedDaysAgo: null });

  store.requests.push(req1, req2, req3, req4);

  const seedNotif = (
    id: string,
    userId: string,
    requestId: string | null,
    type: string,
    title: string,
    body: string,
    createdAt: string,
    readAt: string | null = null
  ) => {
    store.notifications.push({ id, userId, requestId, type, title, body, link: requestId ? `/requests/${requestId}` : null, readAt, createdAt });
  };
  seedNotif(demoUuid(801), DEMO_IDS.head, DEMO_IDS.req1, "NEW_APPROVAL_TASK", "Request moved to Department head approval", "Lab Equipment Access for Autonomous Drone Lab is waiting on you.", daysAgo(1));
  seedNotif(demoUuid(802), DEMO_IDS.student, DEMO_IDS.req2, "CHANGES_REQUESTED", "Changes requested on your request", "Grace Guide asked for a clearer purpose statement before approval.", daysAgo(2));
  seedNotif(demoUuid(803), DEMO_IDS.student, DEMO_IDS.req3, "REQUEST_APPROVED", "Request approved", "Solar Car Telemetry access was approved.", daysAgo(20), daysAgo(15));

  return store;
}

export function demoStore(): DemoStore {
  if (!globalThis.__permitrack_demo || !globalThis.__permitrack_demo.seeded) {
    globalThis.__permitrack_demo = seedStore();
  }
  return globalThis.__permitrack_demo!;
}

function requestSummaryOf(r: DemoRequest): RequestSummary {
  const current = r.stages.find((s) => s.id === r.currentStageId) ?? null;
  return {
    id: r.id,
    status: r.status as RequestSummary["status"],
    project_id: r.projectId,
    project_title: r.projectTitle,
    permission_type_id: r.permissionTypeId,
    permission_type_name: r.permissionTypeName,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    submitted_at: r.submittedAt,
    current_stage_name: current?.name ?? null,
    current_sequence: current?.sequence ?? null,
    stage_count: r.stages.length,
    assigned_approver_name: current?.assigneeId ? personName(current.assigneeId) : null,
    due_at: current?.dueAt ?? null,
  };
}

function sortByUpdated(rows: RequestSummary[]): RequestSummary[] {
  return rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Reads (existing export names kept so services keep working)
// ---------------------------------------------------------------------------

export function demoMyRequests(viewerId: string, limit = 50): RequestSummary[] {
  const store = demoStore();
  const mine =
    viewerId === DEMO_IDS.admin ? store.requests : store.requests.filter((r) => r.createdBy === viewerId);
  return sortByUpdated(mine.map(requestSummaryOf)).slice(0, limit);
}

export function demoRequestsFor(role: DemoRole): RequestSummary[] {
  const store = demoStore();
  const rows = store.requests.map(requestSummaryOf);
  if (role === "admin") return sortByUpdated(rows);
  return sortByUpdated(rows.filter((r) => {
    const full = store.requests.find((x) => x.id === r.id)!;
    return full.createdBy === DEMO_IDS.student;
  }));
}

export function demoInboxFor(role: DemoRole): RequestSummary[] {
  const store = demoStore();
  const active = store.requests.filter((r) =>
    r.stages.some((s) => s.id === r.currentStageId && s.status === "ACTIVE")
  );
  if (role === "student") {
    return sortByUpdated(
      active
        .filter((r) => r.stages.some((s) => s.id === r.currentStageId && s.assigneeId === DEMO_IDS.student))
        .map(requestSummaryOf)
    );
  }
  return sortByUpdated(active.map(requestSummaryOf));
}

export function demoOverdueFor(role: DemoRole): RequestSummary[] {
  const now = nowIso();
  return demoInboxFor(role).filter((r) => r.due_at !== null && r.due_at < now);
}

export function demoCountsFor(role: DemoRole) {
  const store = demoStore();
  const activeStages = store.requests.flatMap((r) =>
    r.stages.filter((s) => s.id === r.currentStageId && s.status === "ACTIVE")
  );
  const now = nowIso();
  const mine = role === "admin" ? activeStages : activeStages.filter((s) => s.assigneeId === DEMO_IDS.student);
  return {
    inbox: mine.length,
    overdue: mine.filter((s) => s.dueAt && s.dueAt < now).length,
    completed: role === "admin" ? store.requests.filter((r) => r.status === "APPROVED").length : 1,
    unreadNotifications: demoNotificationsFor(role === "admin" ? DEMO_IDS.admin : DEMO_IDS.student).filter((n) => !n.read_at).length,
  };
}

export function demoNotificationsFor(userId: string) {
  return demoStore()
    .notifications.filter((n) => n.userId === userId)
    .map((n) => ({
      id: n.id,
      user_id: n.userId,
      request_id: n.requestId,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      read_at: n.readAt,
      created_at: n.createdAt,
    }));
}

export function demoProjectsFor() {
  return demoStore().projects.map((p) => ({ ...p, members: p.members.map((m) => ({ ...m })) }));
}

export function demoProjectDetail(id: string) {
  const project = demoStore().projects.find((p) => p.id === id);
  if (!project) return null;
  return {
    project: {
      ...project,
      departments: { name: project.department_name },
      owner: { name: project.created_by_name, email: DEMO_PEOPLE[project.created_by]?.email ?? "" },
      guide: project.faculty_guide_id
        ? { name: project.faculty_guide_name, email: DEMO_PEOPLE[project.faculty_guide_id]?.email ?? "" }
        : null,
    },
    members: project.members.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      added_at: m.added_at,
      profiles: DEMO_PEOPLE[m.user_id]
        ? { name: DEMO_PEOPLE[m.user_id].name, email: DEMO_PEOPLE[m.user_id].email }
        : null,
    })),
  };
}

export function demoDirectory() {
  return Object.entries(DEMO_PEOPLE)
    .filter(([, p]) => p.roles.some((r) => r !== "student"))
    .map(([id, p]) => ({ id, name: p.name, email: p.email, department: "Computer Science" }));
}

export function demoGuides() {
  return [{ id: DEMO_IDS.guide, name: "Grace Guide", roles: ["faculty_guide"] }];
}

const DEMO_REQUIRED_DOCS = [
  { id: DEMO_IDS.reqLetter, permission_type_id: DEMO_IDS.permissionType, name: "Faculty guide approval letter", description: "Signed by your faculty guide.", is_required: true, accepted_mime_types: ["application/pdf"], max_size_mb: 10, created_at: daysAgo(100) },
  { id: DEMO_IDS.reqSafety, permission_type_id: DEMO_IDS.permissionType, name: "Lab safety certificate", description: "Current lab safety induction certificate.", is_required: true, accepted_mime_types: ["application/pdf"], max_size_mb: 10, created_at: daysAgo(100) },
];

export function demoPermissionType(): PermissionType {
  return {
    id: DEMO_IDS.permissionType,
    name: "Lab Equipment Access",
    description: "Access to lab equipment, workshops and specialist facilities.",
    department_id: DEMO_IDS.deptCS,
    is_active: true,
    form_schema: DEMO_FORM_SCHEMA,
    eligibility_rules: null,
    created_at: daysAgo(100),
    updated_at: daysAgo(10),
  };
}

export function demoPermissionTypes() {
  return [
    {
      id: DEMO_IDS.permissionType,
      name: "Lab Equipment Access",
      description: "Access to lab equipment, workshops and specialist facilities.",
      department_id: DEMO_IDS.deptCS,
      department_name: "Computer Science",
      is_active: true,
      field_count: DEMO_FORM_SCHEMA.fields.length,
      document_count: DEMO_REQUIRED_DOCS.length,
      workflow_version: 1,
      workflow_active: true,
      updated_at: daysAgo(10),
    },
  ];
}

export function demoPermissionTypeDetail() {
  return {
    permissionType: demoPermissionType(),
    documents: DEMO_REQUIRED_DOCS,
    workflows: [demoWorkflowTemplate()],
  };
}

export function demoWorkflowTemplate() {
  const store = demoStore();
  return {
    id: DEMO_IDS.template,
    permission_type_id: DEMO_IDS.permissionType,
    permission_type_name: "Lab Equipment Access",
    name: "Standard lab access chain",
    version: 1,
    is_active: true,
    stage_count: STAGE_DEFS.length,
    request_count: store.requests.length,
    created_at: daysAgo(100),
    stages: STAGE_DEFS.map((def, index) => ({
      id: def.defId,
      sequence: index + 1,
      name: def.name,
      approver_type:
        def.defId === DEMO_IDS.stageGuide ? "PROJECT_FACULTY_GUIDE"
        : def.defId === DEMO_IDS.stageHead ? "DEPARTMENT_HEAD"
        : def.defId === DEMO_IDS.stageDean ? "DEAN" : "LAB_MANAGER",
      approver_role_id: null,
      approver_user_id: def.approverId,
      sla_hours: def.slaHours,
      can_edit_fields: def.canEdit,
      invalidates_on: def.invalidates,
      department_scope: "PROJECT_DEPARTMENT",
      conditions: def.condition,
    })),
  };
}

export function demoUsers() {
  const stamp = daysAgo(100);
  return Object.entries(DEMO_PEOPLE).map(([id, p]) => ({
    id,
    name: p.name,
    email: p.email,
    department_id: DEMO_IDS.deptCS,
    department_name: "Computer Science",
    is_active: true,
    created_at: stamp,
    roles: p.roles.map((role, index) => ({
      id: demoUuid(900 + index),
      role_id: demoUuid(950 + index),
      role_name: role,
      department_id: null as string | null,
    })),
  }));
}

export function demoAdminOverview() {
  const store = demoStore();
  return {
    totalUsers: Object.keys(DEMO_PEOPLE).length,
    activeUsers: Object.keys(DEMO_PEOPLE).length,
    totalRequests: store.requests.length,
    pendingApprovals: store.requests.filter((r) =>
      r.stages.some((s) => s.id === r.currentStageId && s.status === "ACTIVE")
    ).length,
    roles: [
      { id: demoUuid(951), name: "admin", description: "Administrator" },
      { id: demoUuid(952), name: "faculty_guide", description: "Faculty guide" },
      { id: demoUuid(953), name: "department_head", description: "Department head" },
      { id: demoUuid(954), name: "student", description: "Student" },
    ],
  };
}

export function demoAnalytics() {
  const store = demoStore();
  const byStatus: Record<string, number> = {};
  for (const r of store.requests) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const activeStages = store.requests.flatMap((r) =>
    r.stages.filter((s) => s.id === r.currentStageId && s.status === "ACTIVE").map((s) => ({ stage: s, request: r }))
  );
  const now = nowIso();
  const overdue = activeStages.filter(({ stage }) => stage.dueAt && stage.dueAt < now);
  const stalled = store.requests.filter(
    (r) => r.status === "UNDER_REVIEW" && !r.stages.some((s) => s.id === r.currentStageId && s.status === "ACTIVE")
  ).length;

  const completedByStage = new Map<string, { stage: string; permission_type: string; totalMs: number; count: number }>();
  for (const r of store.requests) {
    for (const s of r.stages) {
      if ((s.status === "APPROVED" || s.status === "SKIPPED") && s.startedAt && s.completedAt) {
        const key = `${s.name}||${r.permissionTypeName}`;
        const entry = completedByStage.get(key) ?? { stage: s.name, permission_type: r.permissionTypeName, totalMs: 0, count: 0 };
        entry.totalMs += new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime();
        entry.count += 1;
        completedByStage.set(key, entry);
      }
    }
  }

  const load = new Map<string, { stage: string; permission_type: string; active: number; overdue: number }>();
  for (const { stage, request } of activeStages) {
    const key = `${stage.name}||${request.permissionTypeName}`;
    const entry = load.get(key) ?? { stage: stage.name, permission_type: request.permissionTypeName, active: 0, overdue: 0 };
    entry.active += 1;
    if (stage.dueAt && stage.dueAt < now) entry.overdue += 1;
    load.set(key, entry);
  }

  const allActions = store.requests.flatMap((r) => r.actions).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const weeks: Array<{ week: string; requests: number }> = [0, 1, 2, 3].map((ago) => {
    const start = Date.now() - (ago + 1) * 7 * 86_400_000;
    const end = Date.now() - ago * 7 * 86_400_000;
    return {
      week: ago === 0 ? "this week" : `${ago}w ago`,
      requests: store.requests.filter((r) => {
        const t = new Date(r.createdAt).getTime();
        return t >= start && t < end;
      }).length,
    };
  }).reverse();

  return {
    generatedAt: nowIso(),
    totalRequests: store.requests.length,
    byStatus,
    pendingApprovals: activeStages.length,
    overdueApprovals: overdue.length,
    stalledRequests: stalled,
    averageStageHours: [...completedByStage.values()].map((e) => ({
      stage: e.stage,
      permission_type: e.permission_type,
      completed: e.count,
      avg_hours: Math.round((e.totalMs / e.count / 3_600_000) * 10) / 10,
    })),
    bottlenecks: [...load.values()].sort((a, b) => b.active - a.active),
    recentActions: allActions.slice(0, 20).map((a) => {
      const request = store.requests.find((r) => r.id === a.request_id);
      return {
        id: a.id,
        action: a.action,
        created_at: a.created_at,
        request_id: a.request_id,
        actor_name: personName(a.actor_id),
        permission_type: request?.permissionTypeName ?? "—",
      };
    }),
    weeklyVolume: weeks,
  };
}

export function demoRequestContext(id: string) {
  const store = demoStore();
  const request = store.requests.find((r) => r.id === id);
  if (!request) return null;
  return {
    request: {
      id: request.id,
      project_id: request.projectId,
      permission_type_id: request.permissionTypeId,
      workflow_template_id: request.templateId,
      created_by: request.createdBy,
      status: request.status,
      current_stage_id: request.currentStageId,
      form_data: { ...request.formData },
      submitted_at: request.submittedAt,
      approved_at: request.approvedAt,
      rejected_at: request.rejectedAt,
      withdrawn_at: request.withdrawnAt,
      valid_from: request.validFrom,
      valid_until: null,
      issued_conditions: null,
      created_at: request.createdAt,
      updated_at: request.updatedAt,
    } as unknown as PermissionRequest,
    permissionType: demoPermissionType(),
    stages: request.stages.map((s) => ({
      id: s.id,
      request_id: s.requestId,
      stage_id: s.defId,
      sequence: s.sequence,
      status: s.status,
      assigned_approver_id: s.assigneeId,
      delegated_from_user_id: s.delegatedFrom,
      started_at: s.startedAt,
      completed_at: s.completedAt,
      due_at: s.dueAt,
      decision_comment: s.comment,
      updated_at: request.updatedAt,
      workflow_stages: { can_edit_fields: s.canEdit },
    })) as unknown as Array<any>,
  };
}

export function demoRequestDetail(id: string) {
  const store = demoStore();
  const request = store.requests.find((r) => r.id === id);
  if (!request) return null;
  const context = demoRequestContext(id)!;
  const project = store.projects.find((p) => p.id === request.projectId) ?? store.projects[0];
  const currentDocs = request.documents.filter((d) => !d.replaced_by);
  const actors: Record<string, { name: string; email: string }> = {};
  for (const [userId, person] of Object.entries(DEMO_PEOPLE)) {
    actors[userId] = { name: person.name, email: person.email };
  }
  return {
    request: context.request,
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      department_id: project.department_id,
      created_by: project.created_by,
      faculty_guide_id: project.faculty_guide_id,
      category: project.category,
      status: project.status,
      created_at: project.created_at,
      updated_at: project.updated_at,
      departments: { name: project.department_name },
    },
    permissionType: context.permissionType,
    template: null,
    stages: request.stages.map((s) => ({
      id: s.id,
      request_id: s.requestId,
      stage_id: s.defId,
      sequence: s.sequence,
      status: s.status,
      assigned_approver_id: s.assigneeId,
      delegated_from_user_id: s.delegatedFrom,
      started_at: s.startedAt,
      completed_at: s.completedAt,
      due_at: s.dueAt,
      decision_comment: s.comment,
      updated_at: request.updatedAt,
      workflow_stages: { name: s.name },
    })),
    actions: request.actions.map((a) => ({ ...a })),
    documents: request.documents.map((d) => ({
      ...d,
      required_document_types: d.required_document_type_id
        ? { name: DEMO_REQUIRED_DOCS.find((t) => t.id === d.required_document_type_id)?.name ?? "Document" }
        : null,
    })),
    requiredDocumentTypes: DEMO_REQUIRED_DOCS.map((d) => ({ ...d })),
    queries: request.queries.map((q) => ({ ...q })) as unknown as QueryRow[],
    revisions: request.revisions.map((v) => ({ ...v })),
    members: project.members.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      profiles: DEMO_PEOPLE[m.user_id] ? { name: DEMO_PEOPLE[m.user_id].name, email: DEMO_PEOPLE[m.user_id].email } : null,
    })),
    actors,
    teamProfiles: {
      [request.createdBy]: actors[request.createdBy],
    },
    _demoCurrentDocs: currentDocs,
  };
}

// ---------------------------------------------------------------------------
// Mutations — the interactive part
// ---------------------------------------------------------------------------

function requiredDocsComplete(request: DemoRequest): string[] {
  const current = request.documents.filter((d) => !d.replaced_by);
  return DEMO_REQUIRED_DOCS.filter((t) => t.is_required).filter(
    (t) => !current.some((d) => d.required_document_type_id === t.id)
  ).map((t) => t.name);
}

function currentStageOf(request: DemoRequest): DemoStageState | null {
  return request.stages.find((s) => s.id === request.currentStageId) ?? null;
}

function assertOpen(request: DemoRequest) {
  if (["APPROVED", "REJECTED", "WITHDRAWN"].includes(request.status)) {
    throw new AppError("PT409", "This request is closed and can no longer be changed.", 409);
  }
}

export async function demoCreateRequest(projectId: string, permissionTypeId: string): Promise<string> {
  const actor = await demoActor();
  const store = demoStore();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) throw new AppError("PT404", "Project not found.", 404);
  if (permissionTypeId !== DEMO_IDS.permissionType) throw new AppError("PT404", "Permission type not found.", 404);

  const id = nextId(store);
  const request: DemoRequest = {
    id,
    projectId: project.id,
    projectTitle: project.title,
    permissionTypeId: DEMO_IDS.permissionType,
    permissionTypeName: "Lab Equipment Access",
    templateId: DEMO_IDS.template,
    createdBy: actor.id,
    status: "DRAFT",
    currentStageId: null,
    formData: {},
    submittedAt: null,
    approvedAt: null,
    rejectedAt: null,
    withdrawnAt: null,
    validFrom: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    stages: buildStages(id, store.seq),
    actions: [],
    queries: [],
    documents: [],
    revisions: [],
  };
  logAction(store, request, { actorId: actor.id, action: "SUBMIT_REQUEST", toStatus: "DRAFT", comment: "Draft created." });
  store.requests.unshift(request);
  project.request_count += 1;
  project.updated_at = nowIso();
  return id;
}

export async function demoSaveDraft(requestId: string, formData: Record<string, unknown>) {
  const actor = await demoActor();
  const store = demoStore();
  const request = store.requests.find((r) => r.id === requestId);
  if (!request) throw new AppError("PT404", "Request not found.", 404);
  if (!["DRAFT", "CHANGES_REQUESTED"].includes(request.status)) {
    throw new AppError("PT409", "This request can no longer be edited as a draft.", 409);
  }
  if (request.createdBy !== actor.id && !actor.isAdmin) {
    throw new AppError("PT403", "Only the request owner can edit this draft.", 403);
  }
  const before = { ...request.formData };
  request.formData = { ...formData };
  request.updatedAt = nowIso();
  const changed = JSON.stringify(before) !== JSON.stringify(request.formData);
  if (changed) {
    request.revisions.unshift({
      id: nextId(store),
      request_id: request.id,
      actor_id: actor.id,
      revision_type: request.status === "DRAFT" ? "STUDENT_EDIT" : "STUDENT_RESUBMISSION",
      before_data: before,
      after_data: { ...request.formData },
      reason: null,
      created_at: nowIso(),
    });
  }
  return { ok: true, changed };
}

export async function demoSubmitRequest(requestId: string) {
  const actor = await demoActor();
  const store = demoStore();
  const request = store.requests.find((r) => r.id === requestId);
  if (!request) throw new AppError("PT404", "Request not found.", 404);
  if (request.status !== "DRAFT") throw new AppError("PT409", "Only a draft can be submitted.", 409);
  if (request.createdBy !== actor.id && !actor.isAdmin) {
    throw new AppError("PT403", "Only the request owner can submit.", 403);
  }
  const missing = requiredDocsComplete(request);
  if (missing.length > 0) {
    return { ok: false, code: "MISSING_DOCUMENTS", message: `Upload required documents first: ${missing.join(", ")}.` };
  }
  if (Object.keys(request.formData).length === 0) {
    return { ok: false, code: "EMPTY_FORM", message: "Fill in the form before submitting." };
  }
  request.status = "SUBMITTED";
  request.submittedAt = nowIso();
  request.updatedAt = nowIso();
  logAction(store, request, { actorId: actor.id, action: "SUBMIT_REQUEST", fromStatus: "DRAFT", toStatus: "SUBMITTED" });
  // Immediately route to the first applicable stage.
  const first = request.stages.filter((s) => s.status === "PENDING").sort((a, b) => a.sequence - b.sequence);
  let activated: DemoStageState | null = null;
  for (const candidate of first) {
    if (!stageConditionMet(candidate, request.formData)) {
      candidate.status = "SKIPPED";
      candidate.completedAt = nowIso();
      continue;
    }
    activateStage(store, request, candidate, actor.id);
    activated = candidate;
    break;
  }
  if (!activated) {
    request.status = "UNDER_REVIEW";
  } else {
    request.status = "UNDER_REVIEW";
    notify(store, activated.assigneeId!, {
      requestId: request.id,
      type: "NEW_APPROVAL_TASK",
      title: `New request needs your review: ${request.permissionTypeName}`,
      body: `${request.projectTitle} is waiting at “${activated.name}”.`,
      link: `/requests/${request.id}`,
    });
  }
  logAction(store, request, { actorId: actor.id, action: "SUBMIT_REQUEST", fromStatus: "SUBMITTED", toStatus: "UNDER_REVIEW" });
  return { ok: true, status: request.status };
}

export async function demoWithdrawRequest(requestId: string, reason?: string) {
  const actor = await demoActor();
  const store = demoStore();
  const request = store.requests.find((r) => r.id === requestId);
  if (!request) throw new AppError("PT404", "Request not found.", 404);
  assertOpen(request);
  if (request.createdBy !== actor.id && !actor.isAdmin) {
    throw new AppError("PT403", "Only the request owner can withdraw.", 403);
  }
  const from = request.status;
  request.status = "WITHDRAWN";
  request.withdrawnAt = nowIso();
  request.currentStageId = null;
  request.updatedAt = nowIso();
  logAction(store, request, { actorId: actor.id, action: "WITHDRAW_REQUEST", fromStatus: from, toStatus: "WITHDRAWN", comment: reason ?? null });
  const stage = request.stages.find((s) => s.status === "ACTIVE");
  if (stage?.assigneeId && stage.assigneeId !== actor.id) {
    notify(store, stage.assigneeId, {
      requestId: request.id, type: "REQUEST_WITHDRAWN",
      title: "A request was withdrawn", body: `${request.permissionTypeName} for ${request.projectTitle} was withdrawn.`,
      link: `/requests/${request.id}`,
    });
  }
  return { ok: true, status: request.status };
}

export async function demoUploadDocument(input: {
  requestId: string;
  documentTypeId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  replacesDocumentId?: string | null;
}) {
  const actor = await demoActor();
  const store = demoStore();
  const request = store.requests.find((r) => r.id === input.requestId);
  if (!request) throw new AppError("PT404", "Request not found.", 404);
  assertOpen(request);
  if (input.documentTypeId && !DEMO_REQUIRED_DOCS.some((t) => t.id === input.documentTypeId)) {
    throw new AppError("PT404", "Document type not found.", 404);
  }
  let version = 1;
  if (input.replacesDocumentId) {
    const previous = request.documents.find((d) => d.id === input.replacesDocumentId && !d.replaced_by);
    if (!previous) throw new AppError("PT404", "Document to replace was not found.", 404);
    version = (previous.version as number) + 1;
    const replacementId = nextId(store);
    previous.replaced_by = replacementId;
    const row = {
      id: replacementId, request_id: request.id, required_document_type_id: previous.required_document_type_id,
      file_name: input.fileName, mime_type: input.mimeType, size_bytes: input.sizeBytes,
      storage_path: `demo/${request.id}/replacement-v${version}`, version,
      verification_status: "PENDING", uploaded_by: actor.id, replaced_by: null, created_at: nowIso(),
    };
    request.documents.push(row);
    request.revisions.unshift({
      id: nextId(store), request_id: request.id, actor_id: actor.id, revision_type: "DOCUMENT_REPLACEMENT",
      before_data: { document: previous.file_name, version: previous.version },
      after_data: { document: row.file_name, version }, reason: null, created_at: nowIso(),
    });
    logAction(store, request, { actorId: actor.id, action: "REPLACE_DOCUMENT", comment: input.fileName });
    request.updatedAt = nowIso();
    return { documentId: row.id, version };
  }
  const existing = request.documents.filter(
    (d) => !d.replaced_by && (d.required_document_type_id ?? null) === input.documentTypeId
  );
  version = existing.length + 1;
  const row = {
    id: nextId(store), request_id: request.id, required_document_type_id: input.documentTypeId,
    file_name: input.fileName, mime_type: input.mimeType, size_bytes: input.sizeBytes,
    storage_path: `demo/${request.id}/${input.documentTypeId ?? "extra"}-v${version}`, version,
    verification_status: "PENDING", uploaded_by: actor.id, replaced_by: null, created_at: nowIso(),
  };
  request.documents.push(row);
  logAction(store, request, { actorId: actor.id, action: "UPLOAD_DOCUMENT", comment: input.fileName });
  request.updatedAt = nowIso();
  return { documentId: row.id, version };
}

export async function demoVerifyDocument(documentId: string, status: "PENDING" | "VERIFIED" | "REJECTED") {
  const actor = await demoActor();
  if (!actor.isAdmin) {
    // Approvers verify implicitly through decisions; only admins flip flags in demo.
    const store = demoStore();
    const request = store.requests.find((r) => r.documents.some((d) => d.id === documentId));
    const stage = request ? currentStageOf(request) : null;
    const allowed = request && stage && (stage.assigneeId === actor.id);
    if (!allowed) throw new AppError("PT403", "Only an administrator can verify documents in the demo.", 403);
  }
  const store = demoStore();
  for (const request of store.requests) {
    const doc = request.documents.find((d) => d.id === documentId);
    if (doc) {
      doc.verification_status = status;
      request.updatedAt = nowIso();
      logAction(store, request, { actorId: actor.id, action: "UPLOAD_DOCUMENT", comment: `Document marked ${status}.` });
      return;
    }
  }
  throw new AppError("PT404", "Document not found.", 404);
}

function canActOnStage(request: DemoRequest, stage: DemoStageState | null, actor: { id: string; isAdmin: boolean }) {
  if (!stage || stage.status !== "ACTIVE") return false;
  if (!["SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED"].includes(request.status)) return false;
  return actor.isAdmin || stage.assigneeId === actor.id;
}

export async function demoPerformAction(input: {
  requestId: string;
  action: string;
  stageStateId?: string | null;
  comment?: string | null;
  payload?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const actor = await demoActor();
  const store = demoStore();
  const request = store.requests.find((r) => r.id === input.requestId);
  if (!request) throw new AppError("PT404", "Request not found.", 404);
  const payload = input.payload ?? {};
  const comment = input.comment?.trim() || null;
  const action = input.action;

  const stage = input.stageStateId
    ? request.stages.find((s) => s.id === input.stageStateId) ?? currentStageOf(request)
    : currentStageOf(request);

  const touch = () => {
    request.updatedAt = nowIso();
  };

  switch (action) {
    case "APPROVE_STAGE": {
      assertOpen(request);
      if (!canActOnStage(request, stage, actor)) {
        throw new AppError("PT403", "Only the assigned approver (or an administrator) can approve this stage.", 403);
      }
      const from = request.status;
      stage!.status = "APPROVED";
      stage!.completedAt = nowIso();
      stage!.comment = comment;
      logAction(store, request, { actorId: actor.id, action: "APPROVE_STAGE", fromStatus: from, stageId: stage!.defId, stageStateId: stage!.id, toStatus: "UNDER_REVIEW", comment });
      const next = advanceAfter(store, request, stage!.sequence, actor.id);
      request.status = "UNDER_REVIEW";
      if (!next) {
        request.status = "APPROVED";
        request.approvedAt = nowIso();
        request.validFrom = nowIso();
        logAction(store, request, { actorId: actor.id, action: "ISSUE_FINAL_PERMISSION", fromStatus: from, toStatus: "APPROVED" });
        notify(store, request.createdBy, {
          requestId: request.id, type: "REQUEST_APPROVED",
          title: "Request approved", body: `${request.permissionTypeName} for ${request.projectTitle} was approved.`,
          link: `/requests/${request.id}`,
        });
      } else {
        notify(store, request.createdBy, {
          requestId: request.id, type: "STAGE_APPROVED",
          title: `Stage approved: ${stage!.name}`, body: `Your request moved to “${next.name}”.`,
          link: `/requests/${request.id}`,
        });
        notify(store, next.assigneeId!, {
          requestId: request.id, type: "NEW_APPROVAL_TASK",
          title: `New request needs your review: ${request.permissionTypeName}`,
          body: `${request.projectTitle} is waiting at “${next.name}”.`,
          link: `/requests/${request.id}`,
        });
      }
      touch();
      return { ok: true, status: request.status };
    }

    case "REJECT_REQUEST": {
      assertOpen(request);
      if (!canActOnStage(request, stage, actor)) {
        throw new AppError("PT403", "Only the assigned approver (or an administrator) can reject.", 403);
      }
      if (!comment) throw new AppError("PT422", "A reason is required to reject.", 422);
      const from = request.status;
      stage!.status = "REJECTED";
      stage!.completedAt = nowIso();
      stage!.comment = comment;
      request.status = "REJECTED";
      request.rejectedAt = nowIso();
      request.currentStageId = null;
      logAction(store, request, { actorId: actor.id, action: "REJECT_REQUEST", fromStatus: from, toStatus: "REJECTED", stageId: stage!.defId, stageStateId: stage!.id, comment });
      notify(store, request.createdBy, {
        requestId: request.id, type: "REQUEST_REJECTED",
        title: "Request rejected", body: comment, link: `/requests/${request.id}`,
      });
      touch();
      return { ok: true, status: request.status };
    }

    case "REQUEST_CHANGES": {
      assertOpen(request);
      if (!canActOnStage(request, stage, actor)) {
        throw new AppError("PT403", "Only the assigned approver (or an administrator) can request changes.", 403);
      }
      if (!comment) throw new AppError("PT422", "Explain what needs to change.", 422);
      const from = request.status;
      request.status = "CHANGES_REQUESTED";
      logAction(store, request, { actorId: actor.id, action: "REQUEST_CHANGES", fromStatus: from, toStatus: "CHANGES_REQUESTED", stageId: stage!.defId, stageStateId: stage!.id, comment });
      notify(store, request.createdBy, {
        requestId: request.id, type: "CHANGES_REQUESTED",
        title: "Changes requested on your request", body: comment, link: `/requests/${request.id}`,
      });
      touch();
      return { ok: true, status: request.status };
    }

    case "ASK_QUERY": {
      assertOpen(request);
      if (!canActOnStage(request, stage, actor)) {
        throw new AppError("PT403", "Only the assigned approver (or an administrator) can ask questions.", 403);
      }
      if (!comment) throw new AppError("PT422", "Write the question you want to ask.", 422);
      const blocking = payload.is_blocking !== false;
      const query = {
        id: nextId(store), request_id: request.id, stage_id: stage!.defId,
        asked_by: actor.id, responded_by: null, question: comment, response: null,
        status: "OPEN", is_blocking: blocking, created_at: nowIso(), responded_at: null, resolved_at: null,
      };
      request.queries.unshift(query);
      if (blocking) stage!.status = "WAITING_STUDENT";
      logAction(store, request, { actorId: actor.id, action: "ASK_QUERY", stageId: stage!.defId, stageStateId: stage!.id, comment });
      notify(store, request.createdBy, {
        requestId: request.id, type: "NEW_QUERY",
        title: "An approver asked a question", body: comment, link: `/requests/${request.id}`,
      });
      touch();
      return { ok: true, queryId: query.id };
    }

    case "ANSWER_QUERY": {
      assertOpen(request);
      const queryId = String(payload.queryId ?? "");
      const response = String(payload.response ?? "").trim();
      const query = request.queries.find((q) => q.id === queryId && q.status === "OPEN");
      if (!query) throw new AppError("PT404", "Question not found.", 404);
      if (request.createdBy !== actor.id && !actor.isAdmin) {
        throw new AppError("PT403", "Only the student can answer this question.", 403);
      }
      if (!response) throw new AppError("PT422", "Write a response before sending.", 422);
      query.response = response;
      query.responded_by = actor.id;
      query.responded_at = nowIso();
      query.resolved_at = nowIso();
      query.status = "RESOLVED";
      logAction(store, request, { actorId: actor.id, action: "ANSWER_QUERY", stageId: query.stage_id, comment: response });
      // Resume the stage when no blocking questions remain open.
      const stillBlocked = request.queries.some((q) => q.status === "OPEN" && q.is_blocking);
      if (!stillBlocked && stage && stage.status === "WAITING_STUDENT") {
        stage.status = "ACTIVE";
        request.status = "UNDER_REVIEW";
      }
      const notifyId = query.asked_by === actor.id ? request.createdBy : (query.asked_by as string);
      if (notifyId !== actor.id) {
        notify(store, notifyId, {
          requestId: request.id, type: "QUERY_ANSWERED",
          title: "A question was answered", body: response, link: `/requests/${request.id}`,
        });
      }
      touch();
      return { ok: true };
    }

    case "RESUBMIT_REQUEST": {
      if (request.status !== "CHANGES_REQUESTED") {
        throw new AppError("PT409", "This request is not waiting for changes.", 409);
      }
      if (request.createdBy !== actor.id && !actor.isAdmin) {
        throw new AppError("PT403", "Only the request owner can resubmit.", 403);
      }
      const values = (payload.formData as Record<string, unknown>) ?? {};
      if (Object.keys(values).length > 0) {
        request.formData = { ...request.formData, ...values };
      }
      request.status = "UNDER_REVIEW";
      if (stage) stage.status = "ACTIVE";
      logAction(store, request, { actorId: actor.id, action: "RESUBMIT_REQUEST", fromStatus: "CHANGES_REQUESTED", toStatus: "UNDER_REVIEW", stageId: stage?.defId ?? null, stageStateId: stage?.id ?? null, comment });
      if (stage?.assigneeId) {
        notify(store, stage.assigneeId, {
          requestId: request.id, type: "RESUBMISSION_RECEIVED",
          title: "Student resubmitted with changes", body: comment ?? `${request.permissionTypeName} is back with you.`,
          link: `/requests/${request.id}`,
        });
      }
      touch();
      return { ok: true, status: request.status };
    }

    case "EDIT_REQUEST_BY_AUTHORITY": {
      assertOpen(request);
      if (!canActOnStage(request, stage, actor)) {
        throw new AppError("PT403", "You cannot edit this request at its current stage.", 403);
      }
      const patch = (payload.formData as Record<string, unknown>) ?? {};
      const editable = new Set(actor.isAdmin ? MATERIAL_FIELDS.concat(DEMO_FORM_SCHEMA.fields.map((f) => f.key)) : stage!.canEdit);
      const applied: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        if (editable.has(key)) applied[key] = value;
      }
      if (Object.keys(applied).length === 0) {
        throw new AppError("PT403", "You do not have permission to edit any of those fields.", 403);
      }
      const before = { ...request.formData };
      request.formData = { ...request.formData, ...applied };
      const changedMaterial = Object.keys(applied).filter(
        (key) => MATERIAL_FIELDS.includes(key) && JSON.stringify(before[key]) !== JSON.stringify(applied[key])
      );
      request.revisions.unshift({
        id: nextId(store), request_id: request.id, actor_id: actor.id, revision_type: "AUTHORITY_EDIT",
        before_data: before, after_data: { ...request.formData },
        reason: (payload.reason as string) ?? comment, created_at: nowIso(),
      });
      logAction(store, request, { actorId: actor.id, action: "EDIT_REQUEST_BY_AUTHORITY", stageId: stage!.defId, stageStateId: stage!.id, comment, payload: { formData: applied } });
      let reapprovalRequired = false;
      if (changedMaterial.length > 0) {
        const invalidated: DemoStageState[] = [];
        for (const s of request.stages) {
          if (s.status !== "APPROVED") continue;
          if (s.invalidates.length === 0 || s.invalidates.some((f) => changedMaterial.includes(f))) {
            s.status = "INVALIDATED";
            s.completedAt = nowIso();
            invalidated.push(s);
          }
        }
        if (invalidated.length > 0) {
          reapprovalRequired = true;
          invalidated.sort((a, b) => a.sequence - b.sequence);
          const restart = invalidated[0];
          restart.status = "ACTIVE";
          restart.startedAt = nowIso();
          restart.dueAt = hoursAhead(restart.startedAt, STAGE_DEFS[restart.sequence - 1].slaHours);
          restart.completedAt = null;
          request.currentStageId = restart.id;
          request.status = "UNDER_REVIEW";
          request.revisions.unshift({
            id: nextId(store), request_id: request.id, actor_id: actor.id, revision_type: "WORKFLOW_REVALIDATION",
            before_data: { invalidated: invalidated.map((s) => s.name) }, after_data: { restartedAt: restart.name },
            reason: `Material change: ${changedMaterial.join(", ")}`, created_at: nowIso(),
          });
          logAction(store, request, { actorId: actor.id, action: "EDIT_REQUEST_BY_AUTHORITY", comment: `Re-approval required at ${restart.name}.` });
          for (const s of invalidated) {
            if (s.assigneeId && s.assigneeId !== actor.id) {
              notify(store, s.assigneeId, {
                requestId: request.id, type: "REAPPROVAL_REQUIRED",
                title: "Re-approval required", body: `A material field changed; “${s.name}” needs your review again.`,
                link: `/requests/${request.id}`,
              });
            }
          }
        }
      }
      touch();
      return { ok: true, reapprovalRequired };
    }

    case "FORWARD_STAGE": {
      assertOpen(request);
      if (!canActOnStage(request, stage, actor)) {
        throw new AppError("PT403", "Only the assigned approver (or an administrator) can forward.", 403);
      }
      const targetId = String(payload.targetStageStateId ?? "");
      const target = request.stages.find((s) => s.id === targetId);
      if (!target || target.sequence <= stage!.sequence || target.status !== "PENDING") {
        throw new AppError("PT422", "Choose a later pending stage to forward to.", 422);
      }
      stage!.status = "SKIPPED";
      stage!.completedAt = nowIso();
      if (!stageConditionMet(target, request.formData)) {
        throw new AppError("PT422", "That stage does not apply to this request.", 422);
      }
      activateStage(store, request, target, actor.id);
      request.status = "UNDER_REVIEW";
      logAction(store, request, { actorId: actor.id, action: "FORWARD_STAGE", stageId: stage!.defId, stageStateId: stage!.id, comment });
      touch();
      return { ok: true, status: request.status };
    }

    case "DELEGATE_STAGE": {
      assertOpen(request);
      if (!canActOnStage(request, stage, actor)) {
        throw new AppError("PT403", "Only the assigned approver (or an administrator) can delegate.", 403);
      }
      const delegateId = String(payload.delegateToUserId ?? "");
      if (!DEMO_PEOPLE[delegateId]) throw new AppError("PT422", "Choose a valid person to delegate to.", 422);
      if (delegateId === stage!.assigneeId) throw new AppError("PT422", "That person is already assigned.", 422);
      const from = stage!.assigneeId;
      stage!.delegatedFrom = from;
      stage!.assigneeId = delegateId;
      logAction(store, request, { actorId: actor.id, action: "DELEGATE_STAGE", stageId: stage!.defId, stageStateId: stage!.id, comment });
      notify(store, delegateId, {
        requestId: request.id, type: "STAGE_DELEGATED",
        title: "A stage was delegated to you", body: `${request.permissionTypeName} at “${stage!.name}”.`,
        link: `/requests/${request.id}`,
      });
      touch();
      return { ok: true };
    }

    default:
      throw new AppError("PT422", "Unknown action.", 422);
  }
}

export async function demoAssignStage(requestId: string, stageStateId: string, approverId: string, reason?: string) {
  const actor = await demoActor();
  if (!actor.isAdmin) throw new AppError("PT403", "Administrator privileges are required.", 403);
  const store = demoStore();
  const request = store.requests.find((r) => r.id === requestId);
  if (!request) throw new AppError("PT404", "Request not found.", 404);
  const stage = request.stages.find((s) => s.id === stageStateId);
  if (!stage) throw new AppError("PT404", "Stage not found.", 404);
  if (!["PENDING", "INVALIDATED"].includes(stage.status)) {
    throw new AppError("PT409", "Only a pending or invalidated stage can be assigned.", 409);
  }
  const earlier = request.stages.filter((s) => s.sequence < stage.sequence);
  if (!earlier.every((s) => ["APPROVED", "SKIPPED"].includes(s.status))) {
    throw new AppError("PT409", "Earlier stages must be approved or skipped first.", 409);
  }
  if (!DEMO_PEOPLE[approverId]) throw new AppError("PT422", "Choose a valid approver.", 422);
  stage.assigneeId = approverId;
  stage.status = "ACTIVE";
  stage.startedAt = nowIso();
  stage.dueAt = hoursAhead(stage.startedAt, STAGE_DEFS[stage.sequence - 1].slaHours);
  stage.completedAt = null;
  request.currentStageId = stage.id;
  if (request.status !== "UNDER_REVIEW") request.status = "UNDER_REVIEW";
  logAction(store, request, { actorId: actor.id, action: "DELEGATE_STAGE", stageId: stage.defId, stageStateId: stage.id, comment: reason ?? "Administrator assigned an approver." });
  notify(store, approverId, {
    requestId: request.id, type: "NEW_APPROVAL_TASK",
    title: `You were assigned: ${request.permissionTypeName}`, body: `${request.projectTitle} is waiting at “${stage.name}”.`,
    link: `/requests/${request.id}`,
  });
  request.updatedAt = nowIso();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function demoCreateProject(input: { title: string; description?: string; departmentId: string; category?: string; facultyGuideId?: string | null }) {
  const actor = await demoActor();
  const store = demoStore();
  const id = nextId(store);
  const guide = input.facultyGuideId && DEMO_PEOPLE[input.facultyGuideId] ? input.facultyGuideId : DEMO_IDS.guide;
  const stamp = nowIso();
  store.projects.unshift({
    id,
    title: input.title,
    description: input.description ?? null,
    department_id: DEMO_IDS.deptCS,
    department_name: "Computer Science",
    category: input.category ?? null,
    status: "ACTIVE",
    created_by: actor.id,
    created_by_name: actor.name,
    faculty_guide_id: guide,
    faculty_guide_name: DEMO_PEOPLE[guide].name,
    member_count: 2,
    request_count: 0,
    created_at: stamp,
    updated_at: stamp,
    members: [
      { user_id: actor.id, role: "OWNER", added_at: stamp },
      { user_id: guide, role: "FACULTY_GUIDE", added_at: stamp },
    ],
  });
  return id;
}

export async function demoUpdateProject(projectId: string, input: { title: string; description?: string; category?: string; facultyGuideId?: string | null }) {
  const actor = await demoActor();
  const store = demoStore();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) throw new AppError("PT404", "Project not found.", 404);
  const canManage = actor.isAdmin || project.created_by === actor.id || project.faculty_guide_id === actor.id;
  if (!canManage) throw new AppError("PT403", "You cannot manage this project.", 403);
  project.title = input.title;
  project.description = input.description ?? null;
  project.category = input.category ?? null;
  if (input.facultyGuideId && DEMO_PEOPLE[input.facultyGuideId]) {
    project.faculty_guide_id = input.facultyGuideId;
    project.faculty_guide_name = DEMO_PEOPLE[input.facultyGuideId].name;
    if (!project.members.some((m) => m.user_id === input.facultyGuideId)) {
      project.members.push({ user_id: input.facultyGuideId!, role: "FACULTY_GUIDE", added_at: nowIso() });
    }
  }
  project.updated_at = nowIso();
  project.member_count = project.members.length;
}

export async function demoAddMember(projectId: string, userId: string, role: string) {
  const actor = await demoActor();
  const store = demoStore();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) throw new AppError("PT404", "Project not found.", 404);
  const canManage = actor.isAdmin || project.created_by === actor.id || project.faculty_guide_id === actor.id;
  if (!canManage) throw new AppError("PT403", "You cannot manage this project.", 403);
  if (!DEMO_PEOPLE[userId]) throw new AppError("PT422", "Choose a valid person.", 422);
  if (project.members.some((m) => m.user_id === userId)) throw new AppError("PT409", "That person is already a member.", 409);
  project.members.push({ user_id: userId, role, added_at: nowIso() });
  project.member_count = project.members.length;
  project.updated_at = nowIso();
}

export async function demoRemoveMember(projectId: string, userId: string) {
  const actor = await demoActor();
  const store = demoStore();
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) throw new AppError("PT404", "Project not found.", 404);
  const canManage = actor.isAdmin || project.created_by === actor.id || project.faculty_guide_id === actor.id;
  if (!canManage) throw new AppError("PT403", "You cannot manage this project.", 403);
  if (userId === project.created_by) throw new AppError("PT409", "The project owner cannot be removed.", 409);
  project.members = project.members.filter((m) => m.user_id !== userId);
  project.member_count = project.members.length;
  project.updated_at = nowIso();
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export function demoMarkRead(notificationId: string, userId: string) {
  const store = demoStore();
  const notification = store.notifications.find((n) => n.id === notificationId && n.userId === userId);
  if (!notification) throw new AppError("PT404", "Notification not found.", 404);
  notification.readAt = nowIso();
}

export function demoMarkAllRead(userId: string) {
  const store = demoStore();
  for (const notification of store.notifications) {
    if (notification.userId === userId) notification.readAt = notification.readAt ?? nowIso();
  }
}

// ---------------------------------------------------------------------------
// Viewer + legacy static exports
// ---------------------------------------------------------------------------

function baseViewer(role: DemoRole) {
  if (role === "admin") {
    return {
      user: { id: DEMO_IDS.admin, email: "admin.demo@permittrack.local" },
      profile: {
        id: DEMO_IDS.admin,
        name: "Demo Admin",
        email: "admin.demo@permittrack.local",
        department_id: DEMO_IDS.deptCS,
        is_active: true,
        created_at: daysAgo(180),
        updated_at: daysAgo(1),
      },
      roles: ["admin"],
      isAdmin: true,
      isStaff: true,
      departmentName: "Computer Science",
    };
  }
  return {
    user: { id: DEMO_IDS.student, email: "student.demo@permittrack.local" },
    profile: {
      id: DEMO_IDS.student,
      name: "Demo Student",
      email: "student.demo@permittrack.local",
      department_id: DEMO_IDS.deptCS,
      is_active: true,
      created_at: daysAgo(90),
      updated_at: daysAgo(2),
    },
    roles: ["student"],
    isAdmin: false,
    isStaff: false,
    departmentName: "Computer Science",
  };
}

export async function getDemoViewer() {
  const role = await getDemoSession();
  return role ? baseViewer(role) : null;
}

export function getDemoViewerSync(role: DemoRole) {
  return baseViewer(role);
}

export const DEMO_CREDENTIAL_HINTS = [
  { role: "student" as DemoRole, label: "Demo Student", email: "student.demo@permittrack.local" },
  { role: "admin" as DemoRole, label: "Demo Admin", email: "admin.demo@permittrack.local" },
] as const;

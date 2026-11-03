/**
 * Seed a complete demo university in a Supabase project.
 *
 * Usage:
 *   npm run seed:demo
 *
 * Requirements (see README):
 *   - Migrations 0001..0007 applied to the target project.
 *   - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and
 *     SUPABASE_SERVICE_ROLE_KEY in .env.local (or .env).
 *
 * The script is idempotent: re-running it reuses existing users, departments,
 * catalogue entries, workflows and the sample request instead of duplicating
 * them. It never deletes data.
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: [".env.local", ".env"] });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "PermiTrack#2026";

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error(
    [
      "Missing Supabase configuration.",
      "",
      "Set these in .env.local before seeding:",
      "  NEXT_PUBLIC_SUPABASE_URL",
      "  NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "  SUPABASE_SERVICE_ROLE_KEY",
    ].join("\n")
  );
  process.exit(1);
}

const service = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface DemoUser {
  email: string;
  name: string;
  role: string | null;
  department: "root" | "cs" | null;
  universityWide?: boolean;
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  student: "Owns projects and submits permission requests.",
  faculty_guide: "Reviews requests for projects they guide.",
  department_head: "Approves requests for their department and its children.",
  lab_manager: "Clears lab equipment and facility access requests.",
  dean: "Final academic approval for high-risk or escalated requests.",
  admin: "Configures the catalogue, workflows and people; can recover stalled requests.",
};

const USERS: DemoUser[] = [
  { email: "admin@permitrack.demo", name: "Avery Administrator", role: "admin", department: "root", universityWide: true },
  { email: "dean@permitrack.demo", name: "Dana Dean", role: "dean", department: "root", universityWide: true },
  { email: "head.cs@permitrack.demo", name: "Hassan Head", role: "department_head", department: "cs" },
  { email: "guide@permitrack.demo", name: "Grace Guide", role: "faculty_guide", department: "cs" },
  { email: "lab@permitrack.demo", name: "Lena Labmanager", role: "lab_manager", department: "cs" },
  { email: "student@permitrack.demo", name: "Sam Student", role: "student", department: "cs" },
  { email: "priya@permitrack.demo", name: "Priya Patel", role: "student", department: "cs" },
];

function fail(context: string, error: unknown): never {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  console.error(`\n✖ ${context}\n  ${message}\n`);
  process.exit(1);
}

async function findUserByEmail(email: string) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail("Could not list auth users", error);
    const match = data.users.find((user) => (user.email ?? "").toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser(user: DemoUser): Promise<string> {
  const existing = await findUserByEmail(user.email);
  if (existing) {
    const { error } = await service.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { name: user.name },
    });
    if (error) fail(`Could not update auth user ${user.email}`, error);
    return existing.id;
  }

  const { data, error } = await service.auth.admin.createUser({
    email: user.email,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name: user.name },
  });
  if (error || !data.user) fail(`Could not create auth user ${user.email}`, error);
  return data.user.id;
}

async function ensureRoles() {
  for (const [name, description] of Object.entries(ROLE_DESCRIPTIONS)) {
    const { data: existing, error: selectError } = await service
      .from("roles")
      .select("id")
      .eq("name", name)
      .maybeSingle();
    if (selectError) fail(`Could not read role ${name}`, selectError);
    if (!existing) {
      const { error } = await service.from("roles").insert({ name, description });
      if (error) fail(`Could not create role ${name}`, error);
    }
  }
}

async function roleId(name: string): Promise<string> {
  const { data, error } = await service.from("roles").select("id").eq("name", name).maybeSingle();
  if (error) fail(`Could not read role ${name}`, error);
  if (!data) fail(`Role ${name} is missing`, "Apply migration 0007 (baseline roles) first.");
  return data.id as string;
}

async function ensureDepartment(name: string, parentId: string | null) {
  let query = service.from("departments").select("id").eq("name", name);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const { data: existing, error: selectError } = await query.maybeSingle();
  if (selectError) fail(`Could not read department ${name}`, selectError);
  if (existing) return existing.id as string;

  const { data, error } = await service
    .from("departments")
    .insert({ name, parent_id: parentId })
    .select("id")
    .single();
  if (error || !data) fail(`Could not create department ${name}`, error);
  return data.id as string;
}

async function updateProfile(userId: string, input: { name: string; email: string; departmentId: string }) {
  const { error } = await service
    .from("profiles")
    .upsert(
      { id: userId, name: input.name, email: input.email, department_id: input.departmentId, is_active: true },
      { onConflict: "id" }
    );
  if (error) fail(`Could not update profile for ${input.email}`, error);
}

async function assignRole(userId: string, role: string, departmentId: string | null) {
  const role_id = await roleId(role);
  let query = service
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_id", role_id);
  query = departmentId ? query.eq("department_id", departmentId) : query.is("department_id", null);
  const { data: existing, error: selectError } = await query.maybeSingle();
  if (selectError) fail(`Could not read role assignment for ${userId}`, selectError);

  if (existing) {
    const { error } = await service
      .from("user_roles")
      .update({ is_active: true, starts_at: null, ends_at: null })
      .eq("id", existing.id);
    if (error) fail(`Could not reactivate role assignment for ${userId}`, error);
    return;
  }

  const { error } = await service.from("user_roles").insert({
    user_id: userId,
    role_id,
    department_id: departmentId,
    is_active: true,
  });
  if (error) fail(`Could not assign role ${role} to ${userId}`, error);
}

async function ensureStudentRole(userId: string) {
  const studentRoleId = await roleId("student");
  const { data: existing, error: selectError } = await service
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_id", studentRoleId)
    .maybeSingle();
  if (selectError) fail("Could not read the student role assignment", selectError);
  if (existing) return;
  const { error } = await service
    .from("user_roles")
    .insert({ user_id: userId, role_id: studentRoleId, is_active: true });
  if (error) fail("Could not assign the student role", error);
}

async function ensurePermissionType(departmentId: string) {
  const name = "Lab Equipment Access";
  const { data: existing, error: selectError } = await service
    .from("permission_types")
    .select("id")
    .eq("name", name)
    .maybeSingle();
  if (selectError) fail("Could not read the demo permission type", selectError);
  if (existing) return existing.id as string;

  const form_schema = {
    fields: [
      {
        key: "equipment_name",
        label: "Equipment or facility",
        type: "text",
        required: true,
        material: true,
        help: "Name the machine, lab or facility you need access to.",
        placeholder: "Robotics lab — soldering station",
      },
      {
        key: "purpose",
        label: "Purpose of access",
        type: "textarea",
        required: true,
        material: true,
        help: "Explain what you will do and why it needs this equipment.",
      },
      {
        key: "risk_level",
        label: "Risk level",
        type: "select",
        required: true,
        material: true,
        options: [
          { value: "low", label: "Low — supervised, no hazardous materials" },
          { value: "medium", label: "Medium — tools or moving parts" },
          { value: "high", label: "High — hazardous materials or high voltage" },
        ],
      },
      {
        key: "lab_room",
        label: "Lab room",
        type: "text",
        required: true,
        placeholder: "ENG-214",
      },
      {
        key: "start_date",
        label: "Access from",
        type: "date",
        required: true,
      },
      {
        key: "end_date",
        label: "Access until",
        type: "date",
        required: true,
        material: true,
      },
      {
        key: "needs_supervision",
        label: "Requires staff supervision",
        type: "checkbox",
        help: "Check this if a technician must be present.",
      },
      {
        key: "supervision_notes",
        label: "Supervision arrangements",
        type: "textarea",
        help: "Who supervises, and when.",
        visible_if: { field: "needs_supervision", equals: true },
      },
    ],
  };

  const { data, error } = await service
    .from("permission_types")
    .insert({
      name,
      description:
        "Access to lab equipment, workshops and specialist facilities for an active research project.",
      department_id: departmentId,
      is_active: true,
      form_schema,
      eligibility_rules: {
        max_duration_days: 180,
        requires_active_project: true,
        advisory_only: true,
      },
    })
    .select("id")
    .single();
  if (error || !data) fail("Could not create the demo permission type", error);
  return data.id as string;
}

async function ensureDocumentType(
  permissionTypeId: string,
  input: { name: string; description: string; isRequired: boolean }
) {
  const { data: existing, error: selectError } = await service
    .from("required_document_types")
    .select("id")
    .eq("permission_type_id", permissionTypeId)
    .eq("name", input.name)
    .maybeSingle();
  if (selectError) fail(`Could not read document type ${input.name}`, selectError);
  if (existing) return { id: existing.id as string, name: input.name };

  const { data, error } = await service
    .from("required_document_types")
    .insert({
      permission_type_id: permissionTypeId,
      name: input.name,
      description: input.description,
      is_required: input.isRequired,
      max_size_mb: 10,
    })
    .select("id")
    .single();
  if (error || !data) fail(`Could not create document type ${input.name}`, error);
  return { id: data.id as string, name: input.name };
}

interface StageSeed {
  name: string;
  approver_type: string;
  approver_role_id?: string | null;
  approver_user_id?: string | null;
  department_scope?: string;
  can_edit_fields?: string[];
  invalidates_on?: string[];
  sla_hours?: number;
  conditions?: Record<string, unknown> | null;
}

async function ensureWorkflow(
  permissionTypeId: string,
  createdBy: string,
  stages: StageSeed[]
): Promise<string> {
  const { data: existing, error: selectError } = await service
    .from("workflow_templates")
    .select("id, is_active, version")
    .eq("permission_type_id", permissionTypeId)
    .order("version", { ascending: false });
  if (selectError) fail("Could not read workflow templates", selectError);

  const active = (existing ?? []).find((row) => row.is_active);
  if (active) return active.id as string;
  if ((existing ?? []).length > 0) {
    // A draft exists: publish it rather than adding another version.
    const draft = existing![0];
    const { error } = await service
      .from("workflow_templates")
      .update({ is_active: true })
      .eq("id", draft.id);
    if (error) fail("Could not publish the existing workflow draft", error);
    return draft.id as string;
  }

  const { data: template, error: templateError } = await service
    .from("workflow_templates")
    .insert({
      permission_type_id: permissionTypeId,
      name: "Standard lab access chain",
      version: 1,
      is_active: false,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (templateError || !template) fail("Could not create the demo workflow", templateError);

  const rows = stages.map((stage, index) => ({
    template_id: template.id,
    sequence: index + 1,
    name: stage.name,
    approver_type: stage.approver_type,
    approver_role_id: stage.approver_role_id ?? null,
    approver_user_id: stage.approver_user_id ?? null,
    department_scope: stage.department_scope ?? "PROJECT_DEPARTMENT",
    can_edit_fields: stage.can_edit_fields ?? [],
    invalidates_on: stage.invalidates_on ?? [],
    sla_hours: stage.sla_hours ?? null,
    conditions: stage.conditions ?? null,
  }));

  const { error: stageError } = await service.from("workflow_stages").insert(rows);
  if (stageError) fail("Could not create workflow stages", stageError);

  const { error: publishError } = await service
    .from("workflow_templates")
    .update({ is_active: true })
    .eq("id", template.id);
  if (publishError) fail("Could not publish the demo workflow", publishError);

  return template.id as string;
}

async function ensureProject(input: {
  title: string;
  description: string;
  departmentId: string;
  createdBy: string;
  facultyGuideId: string;
  category: string;
}) {
  const { data: existing, error: selectError } = await service
    .from("projects")
    .select("id")
    .eq("title", input.title)
    .eq("created_by", input.createdBy)
    .maybeSingle();
  if (selectError) fail(`Could not read project ${input.title}`, selectError);
  if (existing) return existing.id as string;

  const { data, error } = await service
    .from("projects")
    .insert({
      title: input.title,
      description: input.description,
      department_id: input.departmentId,
      created_by: input.createdBy,
      faculty_guide_id: input.facultyGuideId,
      category: input.category,
      status: "ACTIVE",
    })
    .select("id")
    .single();
  if (error || !data) fail(`Could not create project ${input.title}`, error);
  return data.id as string;
}

async function ensureMember(projectId: string, userId: string, role: string) {
  const { data: existing, error: selectError } = await service
    .from("project_members")
    .select("project_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) fail("Could not read project membership", selectError);
  if (existing) return;
  const { error } = await service
    .from("project_members")
    .insert({ project_id: projectId, user_id: userId, role });
  if (error) fail("Could not add a project member", error);
}

/** A tiny but valid PDF used for the seeded supporting documents. */
function demoPdf(title: string): Uint8Array {
  const text = title.replace(/[()\\]/g, "");
  const body = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "4 0 obj << /Length 90 >> stream",
    "BT /F1 18 Tf 72 760 Td (PermiTrack demo document) Tj 0 -28 Td /F1 12 Tf (" + text + ") Tj ET",
    "endstream endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "trailer << /Root 1 0 R /Size 6 >>",
    "%%EOF",
  ].join("\n");
  return new TextEncoder().encode(body);
}

async function ensureSeedRequest(input: {
  projectId: string;
  permissionTypeId: string;
  studentEmail: string;
  requiredDocumentTypes: Array<{ id: string; name: string }>;
}) {
  const { data: existing, error: selectError } = await service
    .from("permission_requests")
    .select("id, status")
    .eq("project_id", input.projectId)
    .eq("permission_type_id", input.permissionTypeId)
    .limit(1)
    .maybeSingle();
  if (selectError) fail("Could not read the demo request", selectError);

  const created = !existing;
  if (existing && existing.status !== "DRAFT") {
    return { id: existing.id as string, created: false, status: existing.status as string };
  }

  // Mutations go through the real RPCs as the student so the workflow engine
  // pins versions, resolves approvers and writes the audit trail exactly as it
  // would in the app.
  const studentClient = createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await studentClient.auth.signInWithPassword({
    email: input.studentEmail,
    password: DEMO_PASSWORD,
  });
  if (signInError) fail(`Could not sign in as ${input.studentEmail}`, signInError);

  let requestId = existing?.id as string | undefined;

  if (!requestId) {
    const { data, error } = await studentClient.rpc("api_create_request", {
      p_project_id: input.projectId,
      p_permission_type_id: input.permissionTypeId,
    });
    if (error) fail("Could not create the demo request", error);
    requestId = data as string;
  }

  const today = new Date();
  const start = new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const end = new Date(today.getTime() + 97 * 86_400_000).toISOString().slice(0, 10);

  const formData = {
    equipment_name: "Robotics lab — soldering and 3D printing station",
    purpose:
      "Build and test the flight controller harness for the autonomous drone project. The work needs the soldering station and the enclosed 3D printer.",
    risk_level: "medium",
    lab_room: "ENG-214",
    start_date: start,
    end_date: end,
    needs_supervision: true,
    supervision_notes: "A lab technician is present on weekday afternoons.",
  };

  const { error: draftError } = await studentClient.rpc("api_save_request_draft", {
    p_request_id: requestId,
    p_form_data: formData,
  });
  if (draftError) fail("Could not save the demo request draft", draftError);

  // Only upload the documents that are still missing, so resuming a partially
  // seeded request does not create needless versions.
  const { data: currentDocuments, error: documentError } = await service
    .from("request_documents")
    .select("required_document_type_id, storage_path")
    .eq("request_id", requestId)
    .is("replaced_by", null);
  if (documentError) fail("Could not read the demo request documents", documentError);

  for (const documentType of input.requiredDocumentTypes) {
    const alreadyRegistered = (currentDocuments ?? []).some(
      (document) => document.required_document_type_id === documentType.id
    );
    if (alreadyRegistered) continue;

    const storagePath = `requests/${requestId}/${documentType.id}/demo-v1.pdf`;
    const bytes = demoPdf(documentType.name);
    const { error: uploadError } = await service.storage
      .from("private-documents")
      .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      console.warn(
        `  ! Could not upload “${documentType.name}” (${uploadError.message}). ` +
          "The request stays a draft."
      );
      continue;
    }

    const { error: registerError } = await studentClient.rpc("api_register_document", {
      p_request_id: requestId,
      p_required_document_type_id: documentType.id,
      p_file_name: `${documentType.name}.pdf`,
      p_mime_type: "application/pdf",
      p_size_bytes: bytes.byteLength,
      p_storage_path: storagePath,
    });
    if (registerError) {
      console.warn(`  ! Could not register “${documentType.name}”: ${registerError.message}`);
    }
  }

  const { error: submitError } = await studentClient.rpc("api_submit_request", {
    p_request_id: requestId,
  });
  if (submitError) {
    console.warn(
      `  ! The demo request is a draft and could not be submitted: ${submitError.message}`
    );
    return { id: requestId, created, status: "DRAFT" };
  }

  return { id: requestId, created, status: "UNDER_REVIEW" };

}

async function main() {
  console.log("\nPermiTrack demo seed");
  console.log(`  Supabase: ${SUPABASE_URL}\n`);

  await ensureRoles();
  console.log("✓ Roles");

  const engineeringId = await ensureDepartment("School of Engineering", null);
  const computerScienceId = await ensureDepartment("Computer Science", engineeringId);
  await ensureDepartment("Mechanical Engineering", engineeringId);
  console.log("✓ Departments");

  const departmentIds = { root: engineeringId, cs: computerScienceId };
  const userIds = new Map<string, string>();

  for (const user of USERS) {
    const id = await ensureUser(user);
    userIds.set(user.email, id);
    const departmentId = user.department ? departmentIds[user.department] : null;
    await updateProfile(id, { name: user.name, email: user.email, departmentId: departmentId ?? engineeringId });
    if (user.role === "student") {
      await ensureStudentRole(id);
    } else if (user.role) {
      await assignRole(id, user.role, user.universityWide ? null : departmentId);
    }
  }
  console.log(`✓ ${USERS.length} demo accounts (password: ${DEMO_PASSWORD})`);

  // Department heads are resolved by workflows that use DEPARTMENT_HEAD.
  const headId = userIds.get("head.cs@permitrack.demo")!;
  const { error: headError } = await service
    .from("departments")
    .update({ head_user_id: headId })
    .eq("id", computerScienceId);
  if (headError) fail("Could not set the Computer Science head", headError);
  const { error: rootHeadError } = await service
    .from("departments")
    .update({ head_user_id: headId })
    .eq("id", engineeringId);
  if (rootHeadError) fail("Could not set the School of Engineering head", rootHeadError);
  console.log("✓ Department heads");

  const permissionTypeId = await ensurePermissionType(computerScienceId);
  const documentTypes = [
    await ensureDocumentType(permissionTypeId, {
      name: "Faculty guide approval letter",
      description: "Signed by your faculty guide, dated within the last six months.",
      isRequired: true,
    }),
    await ensureDocumentType(permissionTypeId, {
      name: "Lab safety certificate",
      description: "Current university lab safety induction certificate.",
      isRequired: true,
    }),
  ];
  console.log("✓ Permission type and required documents");

  const adminId = userIds.get("admin@permitrack.demo")!;
  const labManagerRoleId = await roleId("lab_manager");
  const workflowId = await ensureWorkflow(permissionTypeId, adminId, [
    {
      name: "Faculty guide review",
      approver_type: "PROJECT_FACULTY_GUIDE",
      sla_hours: 72,
      can_edit_fields: ["purpose", "end_date"],
      invalidates_on: ["equipment_name", "risk_level"],
    },
    {
      name: "Lab manager clearance",
      approver_type: "LAB_MANAGER",
      approver_role_id: labManagerRoleId,
      sla_hours: 48,
      can_edit_fields: ["lab_room"],
      invalidates_on: [],
    },
    {
      name: "Department head approval",
      approver_type: "DEPARTMENT_HEAD",
      sla_hours: 96,
      can_edit_fields: [],
      invalidates_on: ["equipment_name", "start_date", "end_date", "risk_level"],
    },
    {
      name: "Dean review (high risk only)",
      approver_type: "DEAN",
      sla_hours: 120,
      can_edit_fields: [],
      invalidates_on: ["risk_level"],
      conditions: { field: "risk_level", equals: "high" },
    },
  ]);
  console.log(`✓ Workflow v1 published (${workflowId.slice(0, 8)}…)`);

  const studentId = userIds.get("student@permitrack.demo")!;
  const guideId = userIds.get("guide@permitrack.demo")!;
  const projectId = await ensureProject({
    title: "Autonomous Drone Lab",
    description:
      "Design, build and flight-test a vision-guided drone for campus delivery research. Uses the robotics lab, soldering station and 3D printer.",
    departmentId: computerScienceId,
    createdBy: studentId,
    facultyGuideId: guideId,
    category: "Research",
  });
  await ensureMember(projectId, studentId, "OWNER");
  await ensureMember(projectId, guideId, "FACULTY_GUIDE");
  await ensureMember(projectId, userIds.get("priya@permitrack.demo")!, "MEMBER");
  console.log("✓ Demo project and members");

  const request = await ensureSeedRequest({
    projectId,
    permissionTypeId,
    studentEmail: "student@permitrack.demo",
    requiredDocumentTypes: documentTypes,
  });
  console.log(
    request.status === "DRAFT"
      ? "! Sample request is a draft — fix the warning above, then re-run to submit it"
      : request.created
        ? "✓ Sample request created and submitted (check the faculty guide's inbox)"
        : `✓ Sample request already in ${request.status} — left untouched`
  );

  console.log("\nDemo sign-ins (all use the same password):\n");
  for (const user of USERS) {
    console.log(`  ${user.email.padEnd(30)} ${user.role ?? "no role"}`);
  }
  console.log(`\n  Password: ${DEMO_PASSWORD}`);
  console.log("\nNext: npm run dev  →  http://localhost:3000/login\n");
}

main().catch((error) => fail("Unexpected seeding error", error));

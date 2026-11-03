import {
  assert,
  assertEqual,
  assertRaises,
  asSystem,
  asUser,
  createTestDatabase,
} from "./harness";

const DEPT_ROOT = "11111111-1111-1111-1111-111111111111";
const DEPT_CS = "11111111-1111-1111-1111-111111111112";

const ROLE_STUDENT = "22222222-0000-0000-0000-000000000001";
const ROLE_GUIDE = "22222222-0000-0000-0000-000000000002";
const ROLE_HOD = "22222222-0000-0000-0000-000000000003";
const ROLE_LAB = "22222222-0000-0000-0000-000000000004";
const ROLE_DEAN = "22222222-0000-0000-0000-000000000005";
const ROLE_ADMIN = "22222222-0000-0000-0000-000000000006";

const U_STUDENT = "33333333-0000-0000-0000-000000000001";
const U_STUDENT2 = "33333333-0000-0000-0000-000000000002";
const U_GUIDE = "33333333-0000-0000-0000-000000000003";
const U_HOD = "33333333-0000-0000-0000-000000000004";
const U_LAB = "33333333-0000-0000-0000-000000000005";
const U_DEAN = "33333333-0000-0000-0000-000000000006";
const U_ADMIN = "33333333-0000-0000-0000-000000000007";
const U_OUTSIDER = "33333333-0000-0000-0000-000000000008";

const PROJECT = "44444444-0000-0000-0000-000000000001";
const PT_LAB = "55555555-0000-0000-0000-000000000001";
const DOC_SAFETY = "66666666-0000-0000-0000-000000000001";
const DOC_LETTER = "66666666-0000-0000-0000-000000000002";
const TPL_V1 = "77777777-0000-0000-0000-000000000001";

const USERS = [
  ["student", U_STUDENT, "Student One"],
  ["student2", U_STUDENT2, "Student Two"],
  ["guide", U_GUIDE, "Grace Guide"],
  ["hod", U_HOD, "Helen Head"],
  ["lab", U_LAB, "Larry Lab"],
  ["dean", U_DEAN, "Dana Dean"],
  ["admin", U_ADMIN, "Ada Admin"],
  ["outsider", U_OUTSIDER, "Otto Outsider"],
] as const;

const FORM_DATA = {
  lab_name: "Robotics Lab",
  start_date: "2026-11-01",
  end_date: "2026-12-01",
  purpose: "Build a line-following robot for the capstone showcase.",
  uses_equipment: true,
  equipment_list: "Industrial robot arm, soldering station",
};

async function seed(db: Awaited<ReturnType<typeof createTestDatabase>>) {
  await asSystem(db, async () => {
    await db.exec(`
      insert into public.departments (id, name) values
        ('${DEPT_ROOT}', 'University'),
        ('${DEPT_CS}', 'Computer Science');

      update public.departments set parent_id = '${DEPT_ROOT}' where id = '${DEPT_CS}';

      -- Migration 0007 seeds the baseline roles; the harness uses fixed ids so
      -- replace them before creating test users.
      delete from public.roles;

      insert into public.roles (id, name, description) values
        ('${ROLE_STUDENT}', 'student', 'Student'),
        ('${ROLE_GUIDE}', 'faculty_guide', 'Faculty guide'),
        ('${ROLE_HOD}', 'department_head', 'Department head'),
        ('${ROLE_LAB}', 'lab_manager', 'Lab manager'),
        ('${ROLE_DEAN}', 'dean', 'Dean'),
        ('${ROLE_ADMIN}', 'admin', 'Administrator');
    `);

    for (const [slug, id, name] of USERS) {
      await db.query(
        "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
        [id, `${slug}@example.edu`, JSON.stringify({ name })]
      );
    }

    await db.exec(`
      update public.profiles set department_id = '${DEPT_CS}'
        where id in ('${U_STUDENT}', '${U_STUDENT2}', '${U_GUIDE}', '${U_HOD}', '${U_LAB}', '${U_ADMIN}');
      update public.profiles set department_id = '${DEPT_ROOT}' where id = '${U_DEAN}';

      insert into public.user_roles (user_id, role_id, department_id) values
        ('${U_GUIDE}', '${ROLE_GUIDE}', '${DEPT_CS}'),
        ('${U_HOD}', '${ROLE_HOD}', '${DEPT_CS}'),
        ('${U_LAB}', '${ROLE_LAB}', '${DEPT_CS}'),
        ('${U_DEAN}', '${ROLE_DEAN}', '${DEPT_ROOT}'),
        ('${U_ADMIN}', '${ROLE_ADMIN}', null);

      update public.departments set head_user_id = '${U_HOD}' where id = '${DEPT_CS}';

      insert into public.projects (
        id, title, description, department_id, created_by, faculty_guide_id, category
      ) values (
        '${PROJECT}', 'Autonomous Robotics Capstone',
        'A capstone project building an autonomous robot.', '${DEPT_CS}',
        '${U_STUDENT}', '${U_GUIDE}', 'Research'
      );

      insert into public.project_members (project_id, user_id, role) values
        ('${PROJECT}', '${U_STUDENT}', 'OWNER'),
        ('${PROJECT}', '${U_STUDENT2}', 'MEMBER'),
        ('${PROJECT}', '${U_GUIDE}', 'FACULTY_GUIDE');

      insert into public.permission_types (
        id, name, description, department_id, form_schema
      ) values (
        '${PT_LAB}', 'Lab Equipment Access',
        'Permission to use departmental laboratory equipment.',
        '${DEPT_CS}',
        '${JSON.stringify({
          fields: [
            { key: "lab_name", label: "Lab Name", type: "select", required: true, material: true,
              options: [
                { value: "Robotics Lab", label: "Robotics Lab" },
                { value: "Chemistry Lab", label: "Chemistry Lab" },
              ] },
            { key: "start_date", label: "Start Date", type: "date", required: true, material: true },
            { key: "end_date", label: "End Date", type: "date", required: true, material: true },
            { key: "purpose", label: "Purpose", type: "textarea", required: true, material: false },
            { key: "uses_equipment", label: "Uses equipment?", type: "checkbox", required: false, material: false },
            { key: "equipment_list", label: "Equipment list", type: "textarea", required: false, material: false,
              visible_if: { field: "uses_equipment", equals: true } },
          ],
        })}'::jsonb
      );

      insert into public.required_document_types (
        id, permission_type_id, name, description, is_required
      ) values
        ('${DOC_SAFETY}', '${PT_LAB}', 'Lab Safety Certificate', 'Current safety training certificate', true),
        ('${DOC_LETTER}', '${PT_LAB}', 'Supervisor Letter', 'Signed support letter from the faculty guide', true);

      insert into public.workflow_templates (id, permission_type_id, name, version, is_active, created_by)
      values ('${TPL_V1}', '${PT_LAB}', 'Lab Access Approval', 1, false, '${U_ADMIN}');

      insert into public.workflow_stages (
        id, template_id, sequence, name, approver_type, approver_role_id,
        can_edit_fields, invalidates_on, sla_hours, conditions
      ) values
        ('88888888-0000-0000-0000-000000000001', '${TPL_V1}', 1, 'Faculty Guide Review',
         'PROJECT_FACULTY_GUIDE', null, '{purpose}', '{}', 48, null),
        ('88888888-0000-0000-0000-000000000002', '${TPL_V1}', 2, 'Lab Manager Approval',
         'LAB_MANAGER', '${ROLE_LAB}', '{end_date}', '{lab_name,start_date}', 24, null),
        ('88888888-0000-0000-0000-000000000003', '${TPL_V1}', 3, 'Department Head Approval',
         'DEPARTMENT_HEAD', null, '{}', '{start_date,end_date,lab_name}', 72,
         '{"field":"uses_equipment","equals":true}'::jsonb);

      update public.workflow_templates set is_active = true where id = '${TPL_V1}';
    `);
  });
}

async function rows<T = Record<string, unknown>>(db: any, sql: string, params: any[] = []): Promise<T[]> {
  const result = await db.query(sql, params);
  return result.rows as T[];
}

async function rpc<T = any>(db: any, sql: string, params: any[] = []): Promise<T> {
  const result = await db.query(sql, params);
  return (result.rows[0] as any).r as T;
}

async function createRequest(db: any, formData: any = FORM_DATA) {
  let id = "";
  await asUser(db, U_STUDENT, async () => {
    id = (await rows<{ id: string }>(db, "select public.api_create_request($1,$2) as id", [PROJECT, PT_LAB]))[0].id;
    await rpc(db, "select public.api_save_request_draft($1,$2::jsonb) as r", [id, JSON.stringify(formData)]);
  });
  return id;
}

async function uploadRequiredDocs(db: any, requestId: string) {
  await asUser(db, U_STUDENT, async () => {
    for (const docId of [DOC_SAFETY, DOC_LETTER]) {
      await rpc(
        db,
        "select public.api_register_document($1,$2,$3,$4,$5,$6) as r",
        [requestId, docId, "document.pdf", "application/pdf", 2048,
          `requests/${requestId}/${docId}/v1/document.pdf`]
      );
    }
  });
}

async function submit(db: any, requestId: string) {
  let result: any;
  await asUser(db, U_STUDENT, async () => {
    result = await rpc(db, "select public.api_submit_request($1) as r", [requestId]);
  });
  return result;
}

async function stageState(db: any, requestId: string, sequence: number) {
  const found = await rows<any>(
    db,
    "select * from public.request_stage_states where request_id = $1 and sequence = $2",
    [requestId, sequence]
  );
  return found[0];
}

async function act(
  db: any,
  userId: string,
  requestId: string,
  action: string,
  stageStateId: string | null,
  comment: string | null = null,
  payload: any = {}
) {
  return asUser(db, userId, async () =>
    rpc(db, "select public.api_perform_action($1,$2,$3,$4,$5::jsonb) as r", [
      requestId, action, stageStateId, comment, JSON.stringify(payload),
    ])
  ) as Promise<any>;
}

async function main() {
  const db = await createTestDatabase({ skipStorage: true });
  await seed(db);

  // ---------------------------------------------------------------------
  console.log("→ draft creation, validation and required documents");
  const req = await createRequest(db);

  const draft = await rows<any>(db, "select * from public.permission_requests where id = $1", [req]);
  assertEqual(draft[0].status, "DRAFT", "new request is a draft");
  assert(draft[0].workflow_template_id === TPL_V1, "active workflow version is pinned on creation");

  await assertRaises(
    async () => asUser(db, U_STUDENT, async () => {
      await rpc(db, "select public.api_save_request_draft($1,$2::jsonb) as r", [
        req, JSON.stringify({ ...FORM_DATA, lab_name: "" }),
      ]);
    }),
    /required/i,
    "required field validation"
  );

  await assertRaises(async () => submit(db, req), /Missing required documents/i, "submit without documents");

  await assertRaises(
    async () => asUser(db, U_STUDENT, async () => {
      await rpc(db, "select public.api_register_document($1,$2,$3,$4,$5,$6) as r", [
        req, DOC_SAFETY, "bad.html", "text/html", 100, `requests/${req}/${DOC_SAFETY}/v1/bad.html`,
      ]);
    }),
    /Unsupported file type/i,
    "invalid mime type"
  );

  await assertRaises(
    async () => asUser(db, U_STUDENT, async () => {
      await rpc(db, "select public.api_register_document($1,$2,$3,$4,$5,$6) as r", [
        req, DOC_SAFETY, "big.pdf", "application/pdf", 11 * 1024 * 1024,
        `requests/${req}/${DOC_SAFETY}/v1/big.pdf`,
      ]);
    }),
    /too large/i,
    "file size limit"
  );

  await assertRaises(
    async () => asUser(db, U_STUDENT, async () => {
      await rpc(db, "select public.api_register_document($1,$2,$3,$4,$5,$6) as r", [
        req, DOC_SAFETY, "x.pdf", "application/pdf", 100, `requests/other/${DOC_SAFETY}/x.pdf`,
      ]);
    }),
    /Invalid storage path/i,
    "path traversal / wrong prefix"
  );

  await uploadRequiredDocs(db, req);
  const submitResult = await submit(db, req);
  assertEqual(submitResult.ok, true, "submit succeeds");
  assertEqual(submitResult.status, "UNDER_REVIEW", "request is under review after submit");

  const s1 = await stageState(db, req, 1);
  const s2 = await stageState(db, req, 2);
  const s3 = await stageState(db, req, 3);
  assertEqual(s1.status, "ACTIVE", "first stage active");
  assertEqual(s1.assigned_approver_id, U_GUIDE, "faculty guide assigned");
  assertEqual(s2.status, "PENDING", "second stage pending");
  assertEqual(s3.status, "PENDING", "third stage pending");

  const notificationsForGuide = await rows<any>(
    db, "select * from public.notifications where user_id = $1 and request_id = $2", [U_GUIDE, req]
  );
  assert(notificationsForGuide.length >= 1, "approver receives a notification");
  const notificationsForStudent2 = await rows<any>(
    db, "select * from public.notifications where user_id = $1 and request_id = $2", [U_OUTSIDER, req]
  );
  assertEqual(notificationsForStudent2.length, 0, "unrelated user receives nothing");

  // ---------------------------------------------------------------------
  console.log("→ approver authorization and stage locking");
  await assertRaises(
    () => act(db, U_HOD, req, "APPROVE_STAGE", s1.id),
    /assigned approver/i,
    "non-assigned authority cannot approve"
  );

  await assertRaises(
    () => act(db, U_GUIDE, req, "APPROVE_STAGE", s2.id),
    /assigned approver|active stage/i,
    "future stage cannot be approved"
  );

  await assertRaises(
    () => act(db, U_OUTSIDER, req, "APPROVE_STAGE", s1.id),
    /access to this request/i,
    "outsider cannot act on a request"
  );

  // Query flow
  await act(db, U_GUIDE, req, "ASK_QUERY", s1.id, "Which equipment exactly?", { is_blocking: true });
  await assertRaises(
    () => act(db, U_GUIDE, req, "APPROVE_STAGE", s1.id),
    /Resolve open queries/i,
    "open blocking query prevents approval"
  );

  const openQuery = await rows<any>(db, "select * from public.queries where request_id = $1 and status = 'OPEN'", [req]);
  assertEqual(openQuery.length, 1, "query recorded");

  await assertRaises(
    () => act(db, U_STUDENT2, req, "ANSWER_QUERY", null, null, { queryId: openQuery[0].id, response: "nope" }),
    /not allowed/i,
    "non-team student cannot answer query"
  );

  await act(db, U_STUDENT, req, "ANSWER_QUERY", null, null, {
    queryId: openQuery[0].id,
    response: "Robot arm and soldering station.",
  });

  await assertRaises(
    () => act(db, U_STUDENT, req, "ANSWER_QUERY", null, null, {
      queryId: openQuery[0].id, response: "again",
    }),
    /already been resolved/i,
    "cannot answer an already resolved query"
  );

  const approved1 = await act(db, U_GUIDE, req, "APPROVE_STAGE", s1.id, "Looks good");
  assertEqual(approved1.ok, true, "guide approval succeeds");
  assertEqual((await stageState(db, req, 2)).status, "ACTIVE", "next stage activates after approval");

  // ---------------------------------------------------------------------
  console.log("→ authority edit, material change and re-approval");
  const labState = await stageState(db, req, 2);
  await assertRaises(
    () => act(db, U_LAB, req, "EDIT_REQUEST_BY_AUTHORITY", labState.id, null, {
      formData: { lab_name: "Chemistry Lab" }, reason: "move lab",
    }),
    /not allowed to edit/i,
    "authority cannot edit a field outside can_edit_fields"
  );

  const editResult = await act(db, U_LAB, req, "EDIT_REQUEST_BY_AUTHORITY", labState.id, null, {
    formData: { end_date: "2026-12-15" }, reason: "Lab availability",
  });
  assertEqual(editResult.reapprovalRequired, true, "material edit requires re-approval");
  assertEqual((await stageState(db, req, 1)).status, "ACTIVE", "earlier stage reactivated for re-approval");
  assertEqual((await stageState(db, req, 1)).completed_at, null, "previous approval timestamp cleared");
  assertEqual((await stageState(db, req, 2)).status, "INVALIDATED", "current stage reset");
  assertEqual((await stageState(db, req, 1)).assigned_approver_id, U_GUIDE, "guide re-assigned");
  assertEqual((await rows<any>(db, "select status from public.permission_requests where id=$1", [req]))[0].status, "UNDER_REVIEW", "request back under review");

  const revisions = await rows<any>(db, "select * from public.request_revisions where request_id=$1 order by created_at", [req]);
  assert(revisions.some((r) => r.revision_type === "AUTHORITY_EDIT"), "authority edit revision recorded");
  assert(revisions.some((r) => r.revision_type === "WORKFLOW_REVALIDATION"), "revalidation revision recorded");

  await act(db, U_GUIDE, req, "APPROVE_STAGE", (await stageState(db, req, 1)).id, "Re-approved");
  await act(db, U_LAB, req, "APPROVE_STAGE", (await stageState(db, req, 2)).id, "Lab approved");
  assertEqual((await stageState(db, req, 3)).status, "ACTIVE", "stage 3 active");

  // ---------------------------------------------------------------------
  console.log("→ changes requested, query loop and resubmission");
  const hodState = await stageState(db, req, 3);
  await assertRaises(
    () => act(db, U_HOD, req, "REQUEST_CHANGES", hodState.id, "   "),
    /reason is required/i,
    "changes require a comment"
  );
  await assertRaises(
    () => act(db, U_HOD, req, "REJECT_REQUEST", hodState.id, ""),
    /reason is required/i,
    "rejection requires a comment"
  );

  await act(db, U_HOD, req, "REQUEST_CHANGES", hodState.id,
    "Please attach a risk assessment and shorten the end date.");
  assertEqual((await stageState(db, req, 3)).status, "WAITING_STUDENT", "stage waits for student");
  assertEqual((await rows<any>(db, "select status from public.permission_requests where id=$1", [req]))[0].status, "CHANGES_REQUESTED", "request awaits changes");

  const pendingQuery = await rows<any>(db, "select * from public.queries where request_id=$1 and status='OPEN'", [req]);
  assertEqual(pendingQuery.length, 1, "change request creates an open query");

  await act(db, U_STUDENT, req, "ANSWER_QUERY", null, null, {
    queryId: pendingQuery[0].id, response: "Risk assessment attached.",
  });

  const resubmit = await act(db, U_STUDENT, req, "RESUBMIT_REQUEST", null, "Updated end date", {
    formData: { end_date: "2026-12-10", purpose: "Updated purpose after feedback" },
    reason: "Addressed the department head comment",
  });
  assertEqual(resubmit.ok, true, "resubmission succeeds");
  assertEqual((await stageState(db, req, 3)).status, "ACTIVE", "stage reactivated for review");

  const resubmitRevision = await rows<any>(db, "select * from public.request_revisions where request_id=$1 and revision_type='STUDENT_RESUBMISSION'", [req]);
  assertEqual(resubmitRevision.length, 1, "resubmission revision recorded");

  // ---------------------------------------------------------------------
  console.log("→ final approval, validity and immutability");
  const finalResult = await act(db, U_HOD, req, "APPROVE_STAGE", (await stageState(db, req, 3)).id, "Approved");
  assertEqual(finalResult.finalized, true, "last approval finalizes");

  const final = (await rows<any>(db, "select * from public.permission_requests where id=$1", [req]))[0];
  assertEqual(final.status, "APPROVED", "request approved");
  assertEqual(final.current_stage_id, null, "no active stage after final approval");
  assert(final.approved_at !== null, "approved_at set");
  assert(final.valid_from !== null && final.valid_until !== null, "validity window populated from form data");

  const finalAction = await rows<any>(db, "select * from public.approval_actions where request_id=$1 and action='ISSUE_FINAL_PERMISSION'", [req]);
  assertEqual(finalAction.length, 1, "final permission action issued");

  await assertRaises(
    () => act(db, U_STUDENT, req, "RESUBMIT_REQUEST", null, "late edit", { formData: { purpose: "changed" } }),
    /not allowed|APPROVED|no longer be modified/i,
    "cannot edit after approval"
  );

  await assertRaises(
    async () => asUser(db, U_STUDENT, async () => {
      await rpc(db, "select public.api_register_document($1,$2,$3,$4,$5,$6) as r", [
        req, DOC_SAFETY, "new.pdf", "application/pdf", 100,
        `requests/${req}/${DOC_SAFETY}/v2/new.pdf`,
      ]);
    }),
    /APPROVED|no longer|can no longer/i,
    "cannot upload after approval"
  );

  // ---------------------------------------------------------------------
  console.log("→ withdraw while in review");
  const reqWithdraw = await createRequest(db);
  await uploadRequiredDocs(db, reqWithdraw);
  await submit(db, reqWithdraw);

  await assertRaises(
    async () => {
      await asUser(db, U_GUIDE, async () => {
        await rpc(db, "select public.api_withdraw_request($1, null) as r", [reqWithdraw]);
      });
    },
    /creator or an administrator/i,
    "only the creator may withdraw"
  );

  await asUser(db, U_STUDENT, async () => {
    await rpc(db, "select public.api_withdraw_request($1,$2) as r", [reqWithdraw, "Changed my mind"]);
  });
  const withdrawn = (await rows<any>(db, "select * from public.permission_requests where id=$1", [reqWithdraw]))[0];
  assertEqual(withdrawn.status, "WITHDRAWN", "request withdrawn");
  const withdrawnStage = await stageState(db, reqWithdraw, 1);
  assertEqual(withdrawnStage.status, "INVALIDATED", "active stage invalidated on withdrawal");
  await assertRaises(
    () => act(db, U_GUIDE, reqWithdraw, "APPROVE_STAGE", withdrawnStage.id),
    /assigned approver|WITHDRAWN/i,
    "cannot approve withdrawn request"
  );

  await assertRaises(
    async () => {
      await asUser(db, U_STUDENT, async () => {
        await rpc(db, "select public.api_withdraw_request($1, null) as r", [reqWithdraw]);
      });
    },
    /WITHDRAWN|cannot be withdrawn/i,
    "cannot withdraw twice"
  );

  // ---------------------------------------------------------------------
  console.log("→ delegation and forwarding");
  const reqDelegate = await createRequest(db);
  await uploadRequiredDocs(db, reqDelegate);
  await submit(db, reqDelegate);
  const dState = await stageState(db, reqDelegate, 1);

  await act(db, U_GUIDE, reqDelegate, "DELEGATE_STAGE", dState.id, "On leave", { delegateToUserId: U_HOD });
  assertEqual((await stageState(db, reqDelegate, 1)).assigned_approver_id, U_HOD, "stage reassigned to delegate");
  assertEqual((await stageState(db, reqDelegate, 1)).delegated_from_user_id, U_GUIDE, "delegation source recorded");

  await assertRaises(
    () => act(db, U_GUIDE, reqDelegate, "APPROVE_STAGE", dState.id),
    /assigned approver/i,
    "original approver loses access after delegation"
  );

  await act(db, U_HOD, reqDelegate, "APPROVE_STAGE", dState.id, "Delegate approves");
  const labStage = await stageState(db, reqDelegate, 2);
  await act(db, U_LAB, reqDelegate, "FORWARD_STAGE", labStage.id, "Escalating to head", {
    targetStageStateId: (await stageState(db, reqDelegate, 3)).id,
  });
  assertEqual((await stageState(db, reqDelegate, 2)).status, "SKIPPED", "forwarded stage skipped");
  assertEqual((await stageState(db, reqDelegate, 3)).status, "ACTIVE", "target stage active");

  // ---------------------------------------------------------------------
  console.log("→ conditional stage skipping");
  const reqConditional = await createRequest(db, { ...FORM_DATA, uses_equipment: false, equipment_list: null });
  await uploadRequiredDocs(db, reqConditional);
  await submit(db, reqConditional);
  await act(db, U_GUIDE, reqConditional, "APPROVE_STAGE", (await stageState(db, reqConditional, 1)).id, "ok");
  await act(db, U_LAB, reqConditional, "APPROVE_STAGE", (await stageState(db, reqConditional, 2)).id, "ok");
  const conditional = (await rows<any>(db, "select * from public.permission_requests where id=$1", [reqConditional]))[0];
  assertEqual(conditional.status, "APPROVED", "conditional stage skipped and request finalized");
  assertEqual((await stageState(db, reqConditional, 3)).status, "SKIPPED", "unevaluated stage skipped");

  // ---------------------------------------------------------------------
  console.log("→ missing / inactive approver handling and admin recovery");
  const reqStuck = await createRequest(db);
  await uploadRequiredDocs(db, reqStuck);
  await asSystem(db, async () => {
    await db.exec(`update public.projects set faculty_guide_id = null where id = '${PROJECT}';
                   delete from public.project_members where project_id = '${PROJECT}' and user_id = '${U_GUIDE}';`);
  });
  const blocked = await submit(db, reqStuck);
  assertEqual(blocked.code, "MISSING_APPROVER", "submission blocked without approver");
  const adminNotified = await rows<any>(db, "select * from public.notifications where user_id = $1 and type='MISSING_APPROVER'", [U_ADMIN]);
  assert(adminNotified.length >= 1, "admins notified about missing approver");

  await asSystem(db, async () => {
    await db.exec(`update public.projects set faculty_guide_id = '${U_GUIDE}' where id = '${PROJECT}';
                   insert into public.project_members (project_id, user_id, role) values ('${PROJECT}','${U_GUIDE}','FACULTY_GUIDE');`);
  });

  // deactivate the guide and remove the substitute head -> nobody to assign
  await asSystem(db, async () => {
    await db.exec(`update public.profiles set is_active = false where id = '${U_GUIDE}'`);
  });
  const blocked2 = await submit(db, reqStuck);
  assertEqual(blocked2.code, "MISSING_APPROVER", "inactive approver treated as missing");
  await asSystem(db, async () => {
    await db.exec(`update public.profiles set is_active = true where id = '${U_GUIDE}'`);
  });

  await submit(db, reqStuck);
  const recovered = await act(db, U_ADMIN, reqStuck, "DELEGATE_STAGE", (await stageState(db, reqStuck, 1)).id,
    "Covering for guide", { delegateToUserId: U_HOD });
  assertEqual(recovered.ok, true, "admin can delegate a stuck stage");

  console.log("→ workflow immutability and version pinning");
  const reqPinned = await createRequest(db);
  await assertRaises(
    async () => asSystem(db, async () => {
      await db.exec(`update public.workflow_stages set name = 'Hacked' where template_id = '${TPL_V1}'`);
    }),
    /immutable|published/i,
    "published workflow stages are immutable"
  );

  await asSystem(db, async () => {
    await db.exec(`
      insert into public.workflow_templates (id, permission_type_id, name, version, is_active, created_by)
      values ('77777777-0000-0000-0000-000000000002', '${PT_LAB}', 'Lab Access Approval v2', 2, false, '${U_ADMIN}');
      insert into public.workflow_stages (template_id, sequence, name, approver_type, approver_role_id, sla_hours, conditions)
      values
        ('77777777-0000-0000-0000-000000000002', 1, 'Guide Review v2', 'PROJECT_FACULTY_GUIDE', null, 12, null),
        ('77777777-0000-0000-0000-000000000002', 2, 'Lab Review v2', 'LAB_MANAGER', '${ROLE_LAB}', 12, null),
        ('77777777-0000-0000-0000-000000000002', 3, 'Head Review v2', 'DEPARTMENT_HEAD', null, 12,
         '{"field":"uses_equipment","equals":true}'::jsonb);
      update public.workflow_templates set is_active = false where id = '${TPL_V1}';
      update public.workflow_templates set is_active = true where id = '77777777-0000-0000-0000-000000000002';
    `);
  });

  const pinned = (await rows<any>(db, "select * from public.permission_requests where id=$1", [reqPinned]))[0];
  assertEqual(pinned.workflow_template_id, TPL_V1, "existing request keeps original workflow version");
  const pinnedStages = await rows<any>(db, "select count(*)::int as c from public.request_stage_states where request_id=$1", [reqPinned]);
  assertEqual(pinnedStages[0].c, 3, "existing request keeps original stage set");

  const reqV2 = await createRequest(db);
  const v2 = (await rows<any>(db, "select * from public.permission_requests where id=$1", [reqV2]))[0];
  assertEqual(v2.workflow_template_id, "77777777-0000-0000-0000-000000000002", "new request uses latest active version");

  // ---------------------------------------------------------------------
  console.log("→ internal comments and RLS");
  const reqInternal = await createRequest(db);
  await uploadRequiredDocs(db, reqInternal);
  await submit(db, reqInternal);
  const internalState = await stageState(db, reqInternal, 1);
  await act(db, U_GUIDE, reqInternal, "APPROVE_STAGE", internalState.id, "Confidential internal note", { is_internal: true });

  let studentActionCount = 0;
  await asUser(db, U_STUDENT, async () => {
    studentActionCount = (await rows<any>(db, "select id from public.approval_actions where request_id=$1", [reqInternal])).length;
  });
  const allActions = await rows<any>(db, "select id from public.approval_actions where request_id=$1", [reqInternal]);
  assertEqual(studentActionCount, allActions.length - 1, "student cannot see internal approval notes");

  let visibleRequests = 0;
  await asUser(db, U_OUTSIDER, async () => {
    visibleRequests = (await rows<any>(db, "select id from public.permission_requests where id=$1", [reqInternal])).length;
  });
  assertEqual(visibleRequests, 0, "RLS hides requests from outsiders");

  const canView = await rows<any>(db, "select public.can_view_request($1,$2) as allowed", [reqInternal, U_OUTSIDER]);
  assertEqual(canView[0].allowed, false, "outsider fails document authorization check");

  // ---------------------------------------------------------------------
  console.log("→ analytics and admin guards");
  let analytics: any;
  await asUser(db, U_ADMIN, async () => {
    analytics = await rpc(db, "select public.api_admin_analytics() as r");
  });
  assert(analytics.totalRequests >= 1, "analytics returns request count");
  assert(Array.isArray(analytics.averageStageHours), "analytics returns stage durations");

  await assertRaises(
    async () => asUser(db, U_STUDENT, async () => {
      await rpc(db, "select public.api_admin_analytics() as r");
    }),
    /Administrator privileges/i,
    "non-admin blocked from analytics"
  );

  await assertRaises(
    async () => asUser(db, U_ADMIN, async () => {
      await rpc(db, "select public.api_admin_set_user_roles($1,$2::jsonb) as r", [U_ADMIN, "[]"]);
    }),
    /At least one active administrator/i,
    "last admin cannot be removed"
  );

  await assertRaises(
    async () => asUser(db, U_STUDENT, async () => {
      await rpc(db, "select public.api_admin_set_user_roles($1,$2::jsonb) as r", [U_STUDENT, "[]"]);
    }),
    /Administrator privileges/i,
    "non-admin cannot change roles"
  );

  await assertRaises(
    async () => asUser(db, U_ADMIN, async () => {
      await rpc(db, "select public.api_admin_update_profile($1,$2,$3,$4) as r", [U_ADMIN, "Ada Admin", DEPT_CS, false]);
    }),
    /own account/i,
    "admin cannot deactivate themselves"
  );

  // ---------------------------------------------------------------------
  console.log("→ multiple roles for one user");
  await asSystem(db, async () => {
    await db.exec(`
      insert into public.user_roles (user_id, role_id, department_id)
      values ('${U_GUIDE}', '${ROLE_LAB}', '${DEPT_CS}');
      update public.user_roles set is_active = false
        where user_id = '${U_LAB}' and role_id = '${ROLE_LAB}';
    `);
  });
  const reqMulti = await createRequest(db);
  await uploadRequiredDocs(db, reqMulti);
  await submit(db, reqMulti);
  await act(db, U_GUIDE, reqMulti, "APPROVE_STAGE", (await stageState(db, reqMulti, 1)).id, "guide ok");
  const labStateMulti = await stageState(db, reqMulti, 2);
  assertEqual(labStateMulti.assigned_approver_id, U_GUIDE, "role resolution honours department scoped assignment");
  await act(db, U_GUIDE, reqMulti, "APPROVE_STAGE", labStateMulti.id, "lab ok as second role");
  assertEqual((await stageState(db, reqMulti, 3)).status, "ACTIVE", "same user can hold multiple stage roles");

  console.log("\nAll engine checks passed.");
  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

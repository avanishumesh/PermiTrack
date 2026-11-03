/**
 * Exercises the interactive demo backend end to end (student ↔ admin).
 * Run:  PERMITRACK_DEMO_TEST_ROLE=student npx tsx scripts/demo-interactive-test.ts
 * (the script switches roles itself via the env hook)
 */
import assert from "node:assert";
import {
  DEMO_IDS,
  demoStore,
  demoSubmitRequest,
  demoCreateRequest,
  demoSaveDraft,
  demoPerformAction,
  demoUploadDocument,
  demoWithdrawRequest,
  demoInboxFor,
  demoCountsFor,
  demoNotificationsFor,
  demoRequestDetail,
  demoAnalytics,
} from "../src/lib/demo";

function as(role: "student" | "admin") {
  process.env.PERMITRACK_DEMO_TEST_ROLE = role;
}

async function main() {
  process.env.PERMITRACK_DEMO_TEST_ROLE = "student";

const ok = (value: unknown, label: string) => {
  assert.ok(value, label);
  console.log(`ok - ${label}`);
};

const studentForm = {
  equipment_name: "Demo 3D printer",
  purpose: "Print prototype brackets for the rover.",
  risk_level: "low",
  lab_room: "ENG-214",
  start_date: "2026-12-01",
  end_date: "2027-01-15",
  needs_supervision: false,
};

// 1. Student creates + fills + uploads, but submit is refused while docs are missing.
as("student");
const reqId = await demoCreateRequest(DEMO_IDS.project1, DEMO_IDS.permissionType);
ok(typeof reqId === "string", "student creates a draft request");
await demoSaveDraft(reqId, studentForm);
const refused = await demoSubmitRequest(reqId);
ok(refused.ok === false, "submit refused without required documents");

// 2. Upload both required documents, then submit.
await demoUploadDocument({ requestId: reqId, documentTypeId: DEMO_IDS.reqLetter, fileName: "letter.pdf", mimeType: "application/pdf", sizeBytes: 1234 });
await demoUploadDocument({ requestId: reqId, documentTypeId: DEMO_IDS.reqSafety, fileName: "safety.pdf", mimeType: "application/pdf", sizeBytes: 4321 });
const submitted = await demoSubmitRequest(reqId);
ok(submitted.ok && submitted.status === "UNDER_REVIEW", "student submits, request under review");
let detail = demoRequestDetail(reqId)!;
ok(detail.stages.find((s: any) => s.status === "ACTIVE")?.workflow_stages?.name === "Faculty guide review", "stage 1 active, assigned to guide");

// 3. Admin sees it in the inbox and approves.
as("admin");
ok(demoInboxFor("admin").some((r) => r.id === reqId), "admin inbox contains the new request");
const stage1 = detail.stages.find((s: any) => s.status === "ACTIVE")!;
await demoPerformAction({ requestId: reqId, action: "APPROVE_STAGE", stageStateId: stage1.id, comment: "Looks good." });
detail = demoRequestDetail(reqId)!;
ok(detail.stages.find((s: any) => s.status === "ACTIVE")?.workflow_stages?.name === "Lab manager clearance", "stage 2 active after approval");

// 4. Admin asks a blocking question; student answers; stage resumes.
await demoPerformAction({ requestId: reqId, action: "ASK_QUERY", stageStateId: detail.stages.find((s: any) => s.status === "ACTIVE")!.id, comment: "Which printer model?", payload: { is_blocking: true } });
detail = demoRequestDetail(reqId)!;
ok(detail.stages.find((s: any) => s.sequence === 2)!.status === "WAITING_STUDENT", "blocking query pauses the stage");
ok(demoNotificationsFor(DEMO_IDS.student).some((n) => n.type === "NEW_QUERY"), "student notified of the question");
as("student");
const query = detail.queries.find((q: any) => q.status === "OPEN")!;
await demoPerformAction({ requestId: reqId, action: "ANSWER_QUERY", payload: { queryId: query.id, response: "Prusa MK4." } });
detail = demoRequestDetail(reqId)!;
ok(detail.stages.find((s: any) => s.sequence === 2)!.status === "ACTIVE", "stage resumes after the answer");

// 5. Approvals continue to the end (low risk skips the dean stage).
as("admin");
for (const name of ["Lab manager clearance", "Department head approval"]) {
  const active = demoRequestDetail(reqId)!.stages.find((s: any) => s.status === "ACTIVE")!;
  assert.equal(active.workflow_stages.name, name, `expected ${name}`);
  await demoPerformAction({ requestId: reqId, action: "APPROVE_STAGE", stageStateId: active.id, comment: "Approved." });
}
detail = demoRequestDetail(reqId)!;
ok(detail.request.status === "APPROVED", "request approved end to end");
ok(demoNotificationsFor(DEMO_IDS.student).some((n) => n.type === "REQUEST_APPROVED" && n.request_id === reqId), "student notified of approval");

// 6. High-risk request reaches the conditional dean stage.
as("student");
const highId = await demoCreateRequest(DEMO_IDS.project1, DEMO_IDS.permissionType);
await demoSaveDraft(highId, { ...studentForm, risk_level: "high" });
await demoUploadDocument({ requestId: highId, documentTypeId: DEMO_IDS.reqLetter, fileName: "letter.pdf", mimeType: "application/pdf", sizeBytes: 10 });
await demoUploadDocument({ requestId: highId, documentTypeId: DEMO_IDS.reqSafety, fileName: "safety.pdf", mimeType: "application/pdf", sizeBytes: 10 });
await demoSubmitRequest(highId);
as("admin");
for (const name of ["Faculty guide review", "Lab manager clearance", "Department head approval"]) {
  const active = demoRequestDetail(highId)!.stages.find((s: any) => s.status === "ACTIVE")!;
  assert.equal(active.workflow_stages.name, name, `expected ${name}`);
  await demoPerformAction({ requestId: highId, action: "APPROVE_STAGE", stageStateId: active.id });
}
ok(demoRequestDetail(highId)!.stages.find((s: any) => s.status === "ACTIVE")?.workflow_stages?.name === "Dean review (high risk only)", "dean stage runs for high risk");
{
  const active = demoRequestDetail(highId)!.stages.find((s: any) => s.status === "ACTIVE")!;
  await demoPerformAction({ requestId: highId, action: "APPROVE_STAGE", stageStateId: active.id });
}
ok(demoRequestDetail(highId)!.request.status === "APPROVED", "high-risk request approved by dean");

// 7. Material authority edit invalidates an earlier approval.
as("student");
const editId = await demoCreateRequest(DEMO_IDS.project1, DEMO_IDS.permissionType);
await demoSaveDraft(editId, { ...studentForm });
await demoUploadDocument({ requestId: editId, documentTypeId: DEMO_IDS.reqLetter, fileName: "l.pdf", mimeType: "application/pdf", sizeBytes: 10 });
await demoUploadDocument({ requestId: editId, documentTypeId: DEMO_IDS.reqSafety, fileName: "s.pdf", mimeType: "application/pdf", sizeBytes: 10 });
await demoSubmitRequest(editId);
as("admin");
{
  const s1 = demoRequestDetail(editId)!.stages.find((s: any) => s.sequence === 1)!;
  await demoPerformAction({ requestId: editId, action: "APPROVE_STAGE", stageStateId: s1.id });
  const s2 = demoRequestDetail(editId)!.stages.find((s: any) => s.status === "ACTIVE")!;
  const result: any = await demoPerformAction({
    requestId: editId, action: "EDIT_REQUEST_BY_AUTHORITY", stageStateId: s2.id,
    payload: { formData: { equipment_name: "Industrial robot arm" } },
  });
  ok(result.reapprovalRequired === true, "material change triggers re-approval");
  const after = demoRequestDetail(editId)!;
  ok(after.stages.find((s: any) => s.sequence === 1)!.status === "ACTIVE", "workflow restarts at stage 1");
}

// 8. Request changes → resubmit → withdraw flows.
{
  const s1 = demoRequestDetail(editId)!.stages.find((s: any) => s.status === "ACTIVE")!;
  await demoPerformAction({ requestId: editId, action: "REQUEST_CHANGES", stageStateId: s1.id, comment: "Clarify dates." });
  ok(demoRequestDetail(editId)!.request.status === "CHANGES_REQUESTED", "changes requested");
}
as("student");
await demoPerformAction({ requestId: editId, action: "RESUBMIT_REQUEST", comment: "Updated.", payload: { formData: { purpose: "Updated purpose." } } });
ok(demoRequestDetail(editId)!.request.status === "UNDER_REVIEW", "resubmitted back to review");
await demoWithdrawRequest(editId, "No longer needed.");
ok(demoRequestDetail(editId)!.request.status === "WITHDRAWN", "withdrawn");

// 9. Delegation + admin recovery on a stalled request.
as("student");
const delId = await demoCreateRequest(DEMO_IDS.project1, DEMO_IDS.permissionType);
await demoSaveDraft(delId, { ...studentForm });
await demoUploadDocument({ requestId: delId, documentTypeId: DEMO_IDS.reqLetter, fileName: "l.pdf", mimeType: "application/pdf", sizeBytes: 10 });
await demoUploadDocument({ requestId: delId, documentTypeId: DEMO_IDS.reqSafety, fileName: "s.pdf", mimeType: "application/pdf", sizeBytes: 10 });
await demoSubmitRequest(delId);
as("admin");
{
  const s1 = demoRequestDetail(delId)!.stages.find((s: any) => s.status === "ACTIVE")!;
  await demoPerformAction({ requestId: delId, action: "DELEGATE_STAGE", stageStateId: s1.id, payload: { delegateToUserId: DEMO_IDS.lab } });
  ok(demoRequestDetail(delId)!.stages.find((s: any) => s.sequence === 1)!.assigned_approver_id === DEMO_IDS.lab, "stage delegated");
  ok(demoNotificationsFor(DEMO_IDS.lab).some((n) => n.type === "STAGE_DELEGATED"), "delegate notified");
}

// 10. Counts + analytics stay consistent.
ok(demoInboxFor("admin").length >= 1, "admin inbox non-empty");
ok(demoCountsFor("student").unreadNotifications >= 1, "student has unread notifications");
const analytics: any = demoAnalytics();
ok(analytics.totalRequests >= 7, "analytics counts demo requests");

console.log(`\nAll interactive demo checks passed (${demoStore().requests.length} demo requests in store).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});


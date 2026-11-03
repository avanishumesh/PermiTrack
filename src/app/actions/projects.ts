"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveViewer } from "@/lib/auth";
import { actionError, type ActionState } from "@/lib/errors";
import {
  addProjectMember,
  createProject,
  removeProjectMember,
  updateProject,
} from "@/lib/services/projects";
import { memberInputSchema, projectInputSchema, projectUpdateSchema } from "@/lib/validation/schemas";

function fieldErrors(error: { flatten: () => { fieldErrors: Record<string, string[]> } }) {
  return error.flatten().fieldErrors;
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  const parsed = projectInputSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    departmentId: formData.get("departmentId"),
    category: formData.get("category") ?? undefined,
    facultyGuideId: formData.get("facultyGuideId") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }

  let projectId: string;
  try {
    projectId = await createProject({
      title: parsed.data.title,
      description: parsed.data.description,
      departmentId: parsed.data.departmentId,
      category: parsed.data.category,
      facultyGuideId: parsed.data.facultyGuideId,
    });
  } catch (error) {
    return actionError(error);
  }

  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  const parsed = projectUpdateSchema.safeParse({
    projectId: formData.get("projectId"),
    title: formData.get("title"),
    description: formData.get("description") ?? undefined,
    departmentId: formData.get("departmentId"),
    category: formData.get("category") ?? undefined,
    facultyGuideId: formData.get("facultyGuideId") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }

  try {
    await updateProject({
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      facultyGuideId: parsed.data.facultyGuideId,
    });
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  revalidatePath("/projects");
  return { ok: true, message: "Project updated." };
}

export async function addMemberAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  const parsed = memberInputSchema.safeParse({
    projectId: formData.get("projectId"),
    userId: formData.get("userId"),
    role: formData.get("role") ?? "MEMBER",
  });

  if (!parsed.success) {
    return { ok: false, message: "Choose a user and a valid role.", fieldErrors: fieldErrors(parsed.error) };
  }

  try {
    await addProjectMember(parsed.data.projectId, parsed.data.userId, parsed.data.role);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true, message: "Team member added." };
}

export async function removeMemberAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireActiveViewer();

  const parsed = memberInputSchema
    .pick({ projectId: true, userId: true })
    .safeParse({
      projectId: formData.get("projectId"),
      userId: formData.get("userId"),
    });

  if (!parsed.success) {
    return { ok: false, message: "Invalid request." };
  }

  try {
    await removeProjectMember(parsed.data.projectId, parsed.data.userId);
  } catch (error) {
    return actionError(error);
  }

  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true, message: "Team member removed." };
}

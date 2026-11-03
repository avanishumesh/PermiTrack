import "server-only";
import { createClient } from "@/lib/supabase/server";
import { callRpc } from "@/lib/supabase/server";
import {
  DEMO_IDS,
  demoAddMember,
  demoCreateProject,
  demoDirectory,
  demoGuides,
  demoProjectDetail,
  demoProjectsFor,
  demoRemoveMember,
  demoUpdateProject,
  getDemoSession,
  isDemoId,
  isDemoViewerId,
} from "@/lib/demo";
import type { Department } from "@/lib/types";

export interface ProjectSummary {
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
  updated_at: string;
  created_at: string;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (await getDemoSession().catch(() => null)) {
    return demoProjectsFor() as ProjectSummary[];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "*, departments(name), owner:profiles!projects_created_by_fkey(name), guide:profiles!projects_faculty_guide_id_fkey(name)"
    )
    .order("updated_at", { ascending: false });

  if (error) throw error;
  const rows = (data ?? []) as Array<Record<string, any>>;
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const [{ data: memberRows }, { data: requestRows }] = await Promise.all([
    supabase.from("project_members").select("project_id").in("project_id", ids),
    supabase.from("permission_requests").select("project_id").in("project_id", ids),
  ]);

  const memberCounts = countBy((memberRows ?? []) as Array<{ project_id: string }>);
  const requestCounts = countBy((requestRows ?? []) as Array<{ project_id: string }>);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    department_id: row.department_id,
    department_name: row.departments?.name ?? "—",
    category: row.category,
    status: row.status,
    created_by: row.created_by,
    created_by_name: row.owner?.name ?? "—",
    faculty_guide_id: row.faculty_guide_id,
    faculty_guide_name: row.guide?.name ?? null,
    member_count: memberCounts[row.id] ?? 1,
    request_count: requestCounts[row.id] ?? 0,
    updated_at: row.updated_at,
    created_at: row.created_at,
  }));
}

function countBy(rows: Array<{ project_id: string }>) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.project_id] = (acc[row.project_id] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getProjectDetail(id: string) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(id)) {
    return demoProjectDetail(id);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "*, departments(name), owner:profiles!projects_created_by_fkey(name,email), guide:profiles!projects_faculty_guide_id_fkey(name,email)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { data: members, error: memberError } = await supabase
    .from("project_members")
    .select("user_id, role, added_at, profiles:profiles!project_members_user_id_fkey(name, email)")
    .eq("project_id", id)
    .order("added_at");

  if (memberError) throw memberError;

  return {
    project: data as any,
    members: (members ?? []) as unknown as Array<{
      user_id: string;
      role: string;
      added_at: string;
      profiles?: { name: string; email: string } | null;
    }>,
  };
}

export async function listProjectOptions() {
  if (await getDemoSession().catch(() => null)) {
    return demoProjectsFor().map((project) => ({
      id: project.id,
      title: project.title,
      department_id: project.department_id,
      status: project.status,
    }));
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, department_id, status")
    .eq("status", "ACTIVE")
    .order("title");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; title: string; department_id: string; status: string }>;
}

/**
 * Projects the viewer can open a permission request against: projects they own
 * or are a member of. Administrators may pick any active project.
 */
export async function listMyProjectOptions(viewerId: string, includeAll = false) {  if ((await getDemoSession().catch(() => null)) || isDemoViewerId(viewerId)) {
    return demoProjectsFor().map((project) => ({
      id: project.id,
      title: project.title,
      department_id: project.department_id,
      status: project.status,
    }));
  }

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("user_id", viewerId);

  const ids = ((memberships ?? []) as Array<{ project_id: string }>).map((row) => row.project_id);

  let query = supabase
    .from("projects")
    .select("id, title, department_id, status")
    .eq("status", "ACTIVE")
    .order("title");

  if (!includeAll) {
    query = ids.length
      ? query.or(`created_by.eq.${viewerId},id.in.(${ids.join(",")})`)
      : query.eq("created_by", viewerId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; title: string; department_id: string; status: string }>;
}

export async function listDepartments(): Promise<Department[]> {
  if (await getDemoSession().catch(() => null)) {
    return [
      { id: DEMO_IDS.deptCS, name: "Computer Science", parent_id: null, head_user_id: DEMO_IDS.head, created_at: new Date().toISOString() },
    ];
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, name, parent_id, head_user_id, created_at")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Department[];
}

export async function listFacultyGuides() {
  if (await getDemoSession().catch(() => null)) return demoGuides();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("api_staff_directory");
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; name: string; roles: string[] }>).filter((person) =>
    person.roles?.includes("faculty_guide")
  );
}

export interface DirectoryPerson {
  id: string;
  name: string;
  email: string;
  department: string | null;
}

/**
 * Department-scoped people search. The database restricts non-admins to their
 * own department, so this cannot be used to enumerate the whole university.
 */
export async function searchPeople(query?: string): Promise<DirectoryPerson[]> {
  if (await getDemoSession().catch(() => null)) {
    const needle = (query ?? "").trim().toLowerCase();
    return demoDirectory().filter((person) => {
      if (!needle) return true;
      return (
        person.name.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle)
      );
    });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("api_search_users", {
    p_query: query?.trim() || null,
  });
  if (error) throw error;
  return (data ?? []) as DirectoryPerson[];
}

export async function createProject(input: {
  title: string;
  description?: string;
  departmentId: string;
  category?: string;
  facultyGuideId?: string | null;
}) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(input.departmentId)) {
    return demoCreateProject(input);
  }
  return callRpc<string>("api_create_project", {
    p_title: input.title,
    p_description: input.description ?? null,
    p_department_id: input.departmentId,
    p_category: input.category ?? null,
    p_faculty_guide_id: input.facultyGuideId ?? null,
  });
}

export async function updateProject(input: {
  projectId: string;
  title: string;
  description?: string;
  category?: string;
  facultyGuideId?: string | null;
}) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(input.projectId)) {
    return demoUpdateProject(input.projectId, input);
  }
  return callRpc<void>("api_update_project", {
    p_project_id: input.projectId,
    p_title: input.title,
    p_description: input.description ?? null,
    p_category: input.category ?? null,
    p_faculty_guide_id: input.facultyGuideId ?? null,
  });
}

export async function addProjectMember(projectId: string, userId: string, role: string) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(projectId)) {
    return demoAddMember(projectId, userId, role);
  }
  return callRpc<void>("api_add_project_member", {
    p_project_id: projectId,
    p_user_id: userId,
    p_role: role,
  });
}

export async function removeProjectMember(projectId: string, userId: string) {
  if ((await getDemoSession().catch(() => null)) || isDemoId(projectId)) {
    return demoRemoveMember(projectId, userId);
  }
  return callRpc<void>("api_remove_project_member", {
    p_project_id: projectId,
    p_user_id: userId,
  });
}

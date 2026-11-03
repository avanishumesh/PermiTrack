-- =============================================================================
-- PermiTrack 0007: baseline roles
-- =============================================================================
-- Roles are reference data, not user data: every authorization helper matches
-- on these exact names (`admin`, `faculty_guide`, `department_head`,
-- `lab_manager`, `dean`, `student`). They are seeded idempotently so a fresh
-- database (or `supabase db reset`) is usable without manual setup.
-- =============================================================================

insert into public.roles (name, description)
values
  ('student', 'Owns projects and submits permission requests.'),
  ('faculty_guide', 'Reviews requests for projects they guide.'),
  ('department_head', 'Approves requests for their department and its children.'),
  ('lab_manager', 'Clears lab equipment and facility access requests.'),
  ('dean', 'Final academic approval for high-risk or escalated requests.'),
  ('admin', 'Configures the catalogue, workflows and people; can recover stalled requests.')
on conflict (name) do update
  set description = excluded.description;

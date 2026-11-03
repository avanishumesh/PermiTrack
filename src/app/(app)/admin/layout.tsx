import { requireAdminViewer } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Server-side guard for every /admin/* route. Individual RPCs re-check too.
  await requireAdminViewer();
  return <>{children}</>;
}

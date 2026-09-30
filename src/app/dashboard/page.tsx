import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardProjects } from "@/lib/db/dashboard-projects";
import { ProjectWorkspace } from "@/components/project/project-workspace";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const [user, projects] = await Promise.all([getCurrentUser(), getDashboardProjects()]);

  return (
    <DashboardShell user={user}>
      <ProjectWorkspace
        initialProjects={projects}
        isDashboard
        userName={user?.displayName || "Creator"}
      />
    </DashboardShell>
  );
}

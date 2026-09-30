import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ProjectWorkspace } from "@/components/project/project-workspace";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardProjects } from "@/lib/db/dashboard-projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [user, projects] = await Promise.all([getCurrentUser(), getDashboardProjects()]);

  return (
    <DashboardShell active="Projects" user={user}>
      <ProjectWorkspace initialProjects={projects} />
    </DashboardShell>
  );
}

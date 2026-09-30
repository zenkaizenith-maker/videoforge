import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SceneBuilder } from "@/components/project/scene-builder";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { loadScriptRecord, requireOwnedProject } from "@/lib/scripts/script-repository";

export const dynamic = "force-dynamic";

export default async function SceneBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [user, ownerId] = await Promise.all([getCurrentUser(), requireAuthenticatedUserId().catch(() => null)]);
  if (!user || !ownerId) redirect("/login?next=%2Fprojects%2F" + id + "%2Fscenes");

  const project = await requireOwnedProject(id, ownerId).catch(() => null);
  if (!project) notFound();

  const record = await loadScriptRecord(project.id, ownerId);

  return (
    <DashboardShell active="Projects" user={user}>
      <SceneBuilder
        projectId={project.id}
        projectTitle={project.title}
        initialDocument={record.document}
        initialVersion={record.version}
      />
    </DashboardShell>
  );
}

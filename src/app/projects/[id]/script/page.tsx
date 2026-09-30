import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ScriptStudio } from "@/components/project/script-studio";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { describeScriptStudioProvider } from "@/lib/ai/script-studio-providers";
import {
  buildScriptBrief,
  loadScriptRecord,
  requireOwnedProject,
} from "@/lib/scripts/script-repository";

export const dynamic = "force-dynamic";

export default async function ScriptStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [user, ownerId] = await Promise.all([getCurrentUser(), requireAuthenticatedUserId().catch(() => null)]);
  if (!user || !ownerId) redirect("/login?next=%2Fprojects%2F" + id + "%2Fscript");

  const project = await requireOwnedProject(id, ownerId).catch(() => null);
  if (!project) notFound();

  const [record, brief] = await Promise.all([
    loadScriptRecord(project.id, ownerId),
    buildScriptBrief(project),
  ]);
  const provider = describeScriptStudioProvider();

  return (
    <DashboardShell active="Projects" user={user}>
      <nav className="studio-breadcrumb" aria-label="Breadcrumb">
        <Link href="/projects">Projects</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/projects/${project.id}`}>{project.title}</Link>
        <span aria-hidden="true">/</span>
        <strong>Script</strong>
      </nav>
      <ScriptStudio
        projectId={project.id}
        initialDocument={record.document}
        initialVersion={record.version}
        providerName={provider.provider}
        providerMode={provider.mode}
        providerConfigured={provider.configured}
        providerNotice={provider.message || undefined}
        targetDurationSeconds={brief.targetDurationSeconds}
        aspectRatio={brief.aspectRatio}
        visualStyle={brief.visualStyle}
        voiceStyle={brief.voiceStyle}
      />
    </DashboardShell>
  );
}

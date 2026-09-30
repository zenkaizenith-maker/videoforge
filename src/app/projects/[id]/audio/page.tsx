import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AudioStudio } from "@/components/project/audio-studio";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { loadScriptRecord } from "@/lib/scripts/script-repository";
import { loadAudioTracks } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectAudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, ownerId] = await Promise.all([
    getCurrentUser(),
    requireAuthenticatedUserId().catch(() => null),
  ]);
  if (!user || !ownerId) {
    redirect(`/login?next=%2Fprojects%2F${id}%2Faudio`);
  }

  const [scriptRecord, audioResult] = await Promise.all([
    loadScriptRecord(id, ownerId).catch(() => ({ document: { title: "", scenes: [] }, version: 0 })),
    loadAudioTracks(id, "all"),
  ]);

  if (!audioResult.ok) {
    if (
      audioResult.error === "PROJECT_NOT_OWNED" ||
      audioResult.error === "You do not have access to that project."
    ) {
      notFound();
    }
    return (
      <DashboardShell active="Projects" user={user}>
        <div className="studio">
          <h1>Audio Studio</h1>
          <div className="alert danger" role="alert">
            <strong>Could not load audio tracks</strong>
            <p>{audioResult.error}</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  const initialScenes = scriptRecord.document.scenes.map((scene) => ({
    id: scene.id,
    title: scene.title,
  }));

  return (
    <DashboardShell active="Projects" user={user}>
      <AudioStudio
        projectId={audioResult.data.projectId}
        projectTitle={audioResult.data.projectTitle}
        initialTracks={audioResult.data.tracks}
        initialScenes={initialScenes}
      />
    </DashboardShell>
  );
}

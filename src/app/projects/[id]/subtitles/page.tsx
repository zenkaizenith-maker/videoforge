import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SubtitleStudio } from "@/components/project/subtitle-studio";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { loadSubtitles } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectSubtitlesPage({
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
    redirect(`/login?next=%2Fprojects%2F${id}%2Fsubtitles`);
  }

  const result = await loadSubtitles(id);

  if (!result.ok) {
    if (
      result.error === "PROJECT_NOT_OWNED" ||
      result.error === "You do not have access to that project."
    ) {
      notFound();
    }
    return (
      <DashboardShell active="Projects" user={user}>
        <div className="studio">
          <h1>Subtitles Studio</h1>
          <div className="alert danger" role="alert">
            <strong>Could not load subtitles</strong>
            <p>{result.error}</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="Projects" user={user}>
      <SubtitleStudio
        projectId={result.data.projectId}
        projectTitle={result.data.projectTitle}
        initialSubtitles={result.data.subtitles}
        initialScenes={result.data.scenes}
      />
    </DashboardShell>
  );
}

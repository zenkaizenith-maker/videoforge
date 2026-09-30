import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AssetStudio } from "@/components/project/asset-studio";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { loadScriptRecord } from "@/lib/scripts/script-repository";
import { loadAssets } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectAssetsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, ownerId] = await Promise.all([
    getCurrentUser(),
    requireAuthenticatedUserId().catch(() => null),
  ]);
  if (!user || !ownerId) redirect("/login?next=%2Fprojects%2F" + id + "%2Fassets");

  const [scriptRecord, assetsResult] = await Promise.all([
    loadScriptRecord(id, ownerId).catch(() => ({ document: { title: "", scenes: [] }, version: 0 })),
    loadAssets(id, "all", ""),
  ]);

  if (!assetsResult.ok) {
    if (
      assetsResult.error === "PROJECT_NOT_OWNED" ||
      assetsResult.error === "You do not have access to that project."
    ) {
      notFound();
    }
    return (
      <DashboardShell active="Projects" user={user}>
        <div className="studio">
          <h1>Asset Studio</h1>
          <div className="alert danger" role="alert">
            <strong>Could not load assets</strong>
            <p>{assetsResult.error}</p>
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
      <AssetStudio
        projectId={assetsResult.data.projectId}
        projectTitle={assetsResult.data.projectTitle}
        initialAssets={assetsResult.data.assets}
        initialTotalSizeBytes={assetsResult.data.totalSizeBytes}
        initialScenes={initialScenes}
      />
    </DashboardShell>
  );
}

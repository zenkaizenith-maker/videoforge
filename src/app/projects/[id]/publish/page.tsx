import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PublishStudio } from "@/components/project/publish-studio";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { loadPublishData } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectPublishPage({
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
    redirect(`/login?next=%2Fprojects%2F${id}%2Fpublish`);
  }

  const result = await loadPublishData(id);

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
          <h1>Publish Video</h1>
          <div className="alert danger" role="alert">
            <strong>Could not load publication settings</strong>
            <p>{result.error}</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="Projects" user={user}>
      <PublishStudio initialData={result.data} />
    </DashboardShell>
  );
}

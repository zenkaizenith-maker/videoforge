import { notFound, redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { EditorStudio } from "@/components/project/editor-studio";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { loadEditor } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectEditorPage({
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
    redirect(`/login?next=%2Fprojects%2F${id}%2Feditor`);
  }

  const result = await loadEditor(id);

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
          <h1>Video Editor</h1>
          <div className="alert danger" role="alert">
            <strong>Could not load editor workspace</strong>
            <p>{result.error}</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell active="Projects" user={user}>
      <EditorStudio initialWorkspace={result.data} />
    </DashboardShell>
  );
}

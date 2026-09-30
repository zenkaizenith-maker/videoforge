import Link from "next/link";
import { notFound } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { Badge } from "@/components/ui/feedback";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProjectById } from "@/lib/db/dashboard-projects";

const stages = [
  { label: "Script", href: (id: string) => `/projects/${id}/script` },
  { label: "Scenes", href: (id: string) => `/projects/${id}/scenes` },
  { label: "Assets", href: (id: string) => `/projects/${id}/assets` },
  { label: "Audio", href: (id: string) => `/projects/${id}/audio` },
  { label: "Subtitles", href: (id: string) => `/projects/${id}/subtitles` },
  { label: "Editor", href: (id: string) => `/projects/${id}/editor` },
  { label: "Render", href: (id: string) => `/projects/${id}/render` },
  { label: "Publish", href: (id: string) => `/projects/${id}/publish` },
];


export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, project] = await Promise.all([getCurrentUser(), getProjectById(id)]);
  if (!project) notFound();
  return (
    <DashboardShell active="Projects" user={user}>
      <section className="panel route-card">
        <div className="eyebrow">Project overview</div>
        <div className="metric-row">
          <h1>{project.title}</h1>
          <Badge tone={project.status === "archived" ? "warning" : "default"}>{project.status}</Badge>
        </div>
        <p className="subtle">{project.topic || "No topic has been added yet."}</p>
        <div className="project-detail-grid">
          <div><span>Format</span><strong>{project.settings?.aspectRatio || "Not set"}</strong></div>
          <div><span>Target duration</span><strong>{project.settings ? `${project.settings.durationSeconds} seconds` : "Not set"}</strong></div>
          <div><span>Visual style</span><strong>{project.settings?.visualStyle || "Not set"}</strong></div>
          <div><span>Narration voice</span><strong>{project.settings?.voiceStyle || "Not set"}</strong></div>
        </div>
        <p className="subtle">The full production pipeline is available. Work through each stage to create and publish your video.</p>
        <div className="studio-stages" role="tablist" aria-label="Production stages">
          {stages.map((stage) =>
            stage.href ? (
              <Link key={stage.label} className="studio-stage" href={stage.href(id)} role="tab">
                {stage.label}
              </Link>
            ) : (
              <span key={stage.label} className="studio-stage" role="tab" aria-disabled="true" title="Coming next">
                {stage.label}
              </span>
            )
          )}
        </div>
        <div className="project-actions">
          <Link className="vf-button primary" href={`/projects/${project.id}/script`}>
            Open Script Studio
          </Link>
          <Link className="vf-button secondary" href="/projects">
            Back to projects
          </Link>
        </div>
      </section>
    </DashboardShell>
  );
}

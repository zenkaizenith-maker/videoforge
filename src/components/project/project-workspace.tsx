"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { DashboardProject } from "@/lib/db/dashboard-projects";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-fields";
import { Badge, ProgressBar } from "@/components/ui/feedback";
import { ConfirmDialog, Dropdown, DropdownItem, Modal } from "@/components/ui/overlay";
import { VideoCreationWizard } from "@/components/project/video-creation-wizard";
import { MetricCard } from "@/components/dashboard/metric-card";

type Filter = "all" | "draft" | "rendering" | "completed" | "archived";

const filters: Array<[Filter, string]> = [
  ["all", "All"],
  ["draft", "Drafts"],
  ["rendering", "Rendering"],
  ["completed", "Completed"],
  ["archived", "Archived"],
];

const thumbnailGradients = [
  "linear-gradient(135deg, #2b1f48, #3e5f72)",
  "linear-gradient(135deg, #1f2b48, #2a6f62)",
  "linear-gradient(135deg, #3f2240, #6d3957)",
  "linear-gradient(135deg, #1a3242, #395276)",
  "linear-gradient(135deg, #30264e, #53457a)",
];

function getThumbnailGradient(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % thumbnailGradients.length;
  return thumbnailGradients[index];
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return "Recently";
  }
}

function formatDuration(seconds?: number) {
  if (!seconds) return "60 sec";
  if (seconds < 60) return `${seconds} sec`;
  const mins = Math.floor(seconds / 60);
  const remainingSecs = seconds % 60;
  return remainingSecs ? `${mins}m ${remainingSecs}s` : `${mins} min`;
}

function isRendering(project: DashboardProject) {
  return project.render?.status === "queued" || project.render?.status === "processing";
}

function isCompleted(project: DashboardProject) {
  return project.render?.status === "completed";
}

function label(project: DashboardProject) {
  if (project.status === "archived") return "Archived";
  if (isRendering(project)) return "Rendering";
  if (isCompleted(project)) return "Completed";
  return project.status === "active" ? "In production" : "Draft";
}

interface ProjectWorkspaceProps {
  initialProjects: DashboardProject[];
  isDashboard?: boolean;
  userName?: string;
}

export function ProjectWorkspace({
  initialProjects,
  isDashboard = false,
  userName = "Creator",
}: ProjectWorkspaceProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<DashboardProject[]>(initialProjects);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [createOpen, setCreateOpen] = useState(false);
  const [renameProject, setRenameProject] = useState<DashboardProject | null>(null);
  const [deleteProject, setDeleteProject] = useState<DashboardProject | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  // Live metrics calculation
  const activeCount = projects.filter((p) => p.status !== "archived").length;
  const renderingCount = projects.filter(isRendering).length;
  const completedCount = projects.filter(isCompleted).length;

  // Filtered projects
  const visible = useMemo(() => {
    return projects.filter((project) => {
      const searchTarget = `${project.title} ${project.topic ?? ""}`.toLowerCase();
      const matchesText = !query.trim() || searchTarget.includes(query.toLowerCase());
      const matchesFilter =
        filter === "all" ||
        (filter === "draft" && project.status === "draft") ||
        (filter === "archived" && project.status === "archived") ||
        (filter === "rendering" && isRendering(project)) ||
        (filter === "completed" && isCompleted(project));
      return matchesText && matchesFilter;
    });
  }, [projects, query, filter]);

  // Project Creation


  async function duplicate(project: DashboardProject) {
    setPending(true);
    setError("");
    const client = createClient();
    const {
      data: { user },
    } = await client.auth.getUser();

    if (!user) {
      setPending(false);
      return setError("Your session has expired. Please sign in again.");
    }

    // Ensure profile row exists in public.profiles to satisfy foreign key constraint
    const profileDisplayName =
      user.user_metadata?.display_name ||
      user.email?.split("@")[0] ||
      "Creator";
    await client
      .from("profiles")
      .upsert(
        { id: user.id, display_name: profileDisplayName },
        { onConflict: "id" }
      );

    const { data: copy, error: copyError } = await client
      .from("projects")
      .insert({
        owner_id: user.id,
        title: `${project.title} (Copy)`,
        topic: project.topic,
        status: "draft",
      })
      .select()
      .single();

    if (copyError || !copy) {
      setPending(false);
      return setError(copyError?.message || "Could not duplicate the project.");
    }

    if (project.settings) {
      await client.from("project_settings").insert({
        project_id: copy.id,
        aspect_ratio: project.settings.aspectRatio,
        target_duration_seconds: project.settings.durationSeconds,
        voice_style: project.settings.voiceStyle,
        visual_style: project.settings.visualStyle,
        updated_at: new Date().toISOString(),
      });
    }

    const duplicatedProject: DashboardProject = {
      ...project,
      id: copy.id,
      title: copy.title,
      status: "draft",
      createdAt: copy.created_at,
      updatedAt: copy.updated_at,
      render: null,
    };

    setProjects((current) => [duplicatedProject, ...current]);
    setPending(false);
    router.refresh();
  }

  // Rename Project
  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameProject) return;
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (!title) return;

    setPending(true);
    const now = new Date().toISOString();
    const { error: updateError } = await createClient()
      .from("projects")
      .update({ title, updated_at: now })
      .eq("id", renameProject.id);

    if (updateError) {
      setError("Could not rename the project.");
    } else {
      setProjects((current) =>
        current.map((item) =>
          item.id === renameProject.id ? { ...item, title, updatedAt: now } : item
        )
      );
    }
    setPending(false);
    setRenameProject(null);
    router.refresh();
  }

  // Archive / Unarchive Project
  async function archive(project: DashboardProject) {
    const nextStatus = project.status === "archived" ? "draft" : "archived";
    const now = new Date().toISOString();
    const { error: updateError } = await createClient()
      .from("projects")
      .update({ status: nextStatus, updated_at: now })
      .eq("id", project.id);

    if (!updateError) {
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id ? { ...item, status: nextStatus, updatedAt: now } : item
        )
      );
      router.refresh();
    }
  }

  // Delete Project
  async function remove() {
    if (!deleteProject) return;
    setPending(true);
    const id = deleteProject.id;
    const client = createClient();

    // Clean up dependent settings and render jobs before deleting project
    await client.from("project_settings").delete().eq("project_id", id);
    await client.from("render_jobs").delete().eq("project_id", id);
    const { error: deleteError } = await client.from("projects").delete().eq("id", id);

    if (deleteError) {
      setError("Could not delete the project.");
    } else {
      setProjects((current) => current.filter((project) => project.id !== id));
    }
    setPending(false);
    setDeleteProject(null);
    router.refresh();
  }

  return (
    <>
      {/* Top Header */}
      {isDashboard ? (
        <>
          <div className="page-head">
            <div>
              <div className="eyebrow">Your workspace</div>
              <h1>Good evening, {userName}.</h1>
              <p className="subtle">Plan, produce, and follow every video from one place.</p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>+ Create New Video</Button>
          </div>

          {/* Stats Bar */}
          <section className="metrics" aria-label="Workspace statistics">
            <MetricCard label="Projects" value={String(activeCount).padStart(2, "0")} />
            <MetricCard label="Rendering" value={String(renderingCount).padStart(2, "0")} />
            <MetricCard label="Completed" value={String(completedCount).padStart(2, "0")} />
            <MetricCard label="Storage" value="0 MB" />
          </section>
        </>
      ) : (
        <div className="page-head">
          <div>
            <div className="eyebrow">Projects</div>
            <h1>Your production library</h1>
            <p className="subtle">Every project here belongs to your signed-in workspace.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>+ Create New Video</Button>
        </div>
      )}

      {/* Projects Section */}
      <section className={isDashboard ? "recent-projects" : "project-library"}>
        <div className="metric-row" style={{ marginBottom: "14px" }}>
          <div>
            <h2>{isDashboard ? "Recent projects" : "All projects"}</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {isDashboard && (
              <Link className="text-sm subtle" href="/projects" style={{ marginRight: "4px" }}>
                View all ({projects.length})
              </Link>
            )}
            <div className="view-toggle" role="group" aria-label="View style">
              <button
                type="button"
                className={viewMode === "grid" ? "active" : ""}
                onClick={() => setViewMode("grid")}
                aria-label="Grid view"
                title="Grid view"
              >
                ⊞
              </button>
              <button
                type="button"
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
                aria-label="List view"
                title="List view"
              >
                ☰
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar: Search and Filters */}
        <div className="project-toolbar">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects by name or topic…"
            aria-label="Search projects"
          />

          <div className="project-filters" role="tablist" aria-label="Project status filter">
            {filters.map(([value, name]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "active" : ""}
                onClick={() => setFilter(value)}
                role="tab"
                aria-selected={filter === value}
              >
                {name}
              </button>
            ))}
          </div>

          <Button variant="secondary" onClick={() => setCreateOpen(true)}>
            + Create New Video
          </Button>
        </div>

        {error && (
          <p className="auth-message error" role="alert" style={{ marginBottom: "16px" }}>
            {error}
          </p>
        )}

        {/* Project Cards (Grid or List view) */}
        {visible.length > 0 ? (
          <div
            className={
              viewMode === "list"
                ? "project-list-view"
                : isDashboard
                ? "project-grid"
                : "project-grid"
            }
          >
            {visible.slice(0, isDashboard && !query && filter === "all" ? 6 : undefined).map((project) => (
              <article className="project-card" key={project.id}>
                {/* Thumbnail */}
                <Link
                  href={`/projects/${project.id}`}
                  className="project-thumbnail"
                  style={{ background: getThumbnailGradient(project.title) }}
                  aria-label={`Open ${project.title}`}
                >
                  <span className="thumbnail-tag">
                    {project.settings?.aspectRatio || "16:9"}
                  </span>
                  <span>▶</span>
                  <small>{project.settings?.visualStyle || "Editorial"}</small>
                </Link>

                {/* Card Body */}
                <div className="project-card-body">
                  <div className="project-card-title">
                    <div>
                      <Link href={`/projects/${project.id}`} className="project-name">
                        {project.title}
                      </Link>
                      <p>{project.topic || "No topic description added"}</p>
                    </div>
                    <Badge
                      tone={
                        project.status === "archived"
                          ? "warning"
                          : isCompleted(project)
                          ? "success"
                          : "default"
                      }
                    >
                      {label(project)}
                    </Badge>
                  </div>

                  <div className="project-meta">
                    <span>{formatDuration(project.settings?.durationSeconds)}</span>
                    <span>Updated {formatDate(project.updatedAt)}</span>
                  </div>

                  {/* Progress bar if rendering */}
                  {isRendering(project) && (
                    <div style={{ marginTop: "12px" }}>
                      <ProgressBar
                        value={project.render?.progress ?? 15}
                        label={`Render progress for ${project.title}`}
                      />
                    </div>
                  )}

                  {/* Project Actions */}
                  <div className="project-actions">
                    <Link className="vf-button ghost sm" href={`/projects/${project.id}`}>
                      Open
                    </Link>

                    <Dropdown label="Actions">
                      <DropdownItem onClick={() => duplicate(project)}>Duplicate</DropdownItem>
                      <DropdownItem onClick={() => setRenameProject(project)}>Rename</DropdownItem>
                      <DropdownItem onClick={() => archive(project)}>
                        {project.status === "archived" ? "Unarchive" : "Archive"}
                      </DropdownItem>
                      <DropdownItem onClick={() => setDeleteProject(project)}>Delete</DropdownItem>
                    </Dropdown>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="vf-empty panel">
            <h2>{projects.length ? "No projects match that search" : "Start your first video"}</h2>
            <p>
              {projects.length
                ? "Try clearing your search query or choosing another status tab."
                : "Create your first video project to begin script writing, scene direction, and rendering."}
            </p>
            <div style={{ marginTop: "16px" }}>
              <Button onClick={() => setCreateOpen(true)}>+ Create New Video</Button>
            </div>
          </div>
        )}
      </section>

      {/* Create Project Wizard */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        className="wizard-modal"
      >
        <VideoCreationWizard
          onClose={() => setCreateOpen(false)}
          onSuccess={(project) => {
            setProjects((current) => [project, ...current]);
            setCreateOpen(false);
            router.push(`/projects/${project.id}/script`);
            router.refresh();
          }}
        />
      </Modal>


      {/* Rename Project Modal */}
      <Modal
        open={Boolean(renameProject)}
        title="Rename project"
        onClose={() => setRenameProject(null)}
      >
        <form className="create-project-form" onSubmit={rename}>
          <Field label="Project name">
            <Input name="title" defaultValue={renameProject?.title} required />
          </Field>
          <div className="vf-modal-actions">
            <Button type="button" variant="secondary" onClick={() => setRenameProject(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save name"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteProject)}
        title="Delete project?"
        description={`This permanently deletes “${
          deleteProject?.title ?? ""
        }” and its connected settings and media records.`}
        confirmLabel={pending ? "Deleting…" : "Delete project"}
        onCancel={() => setDeleteProject(null)}
        onConfirm={remove}
      />
    </>
  );
}

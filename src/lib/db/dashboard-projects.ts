import { createClient } from "@/lib/supabase/server";

export type DashboardProject = {
  id: string;
  title: string;
  topic: string | null;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
  settings: {
    aspectRatio: string;
    durationSeconds: number;
    voiceStyle: string | null;
    visualStyle: string | null;
  } | null;
  render: { status: string; progress: number } | null;
};

type RawProjectRecord = {
  id: string;
  title: string;
  topic: string | null;
  status: "draft" | "active" | "archived";
  created_at: string;
  updated_at: string;
  project_settings?:
    | Array<{ aspect_ratio: string; target_duration_seconds: number; voice_style: string | null; visual_style: string | null }>
    | { aspect_ratio: string; target_duration_seconds: number; voice_style: string | null; visual_style: string | null }
    | null;
  render_jobs?:
    | Array<{ status: string; progress: number; created_at: string }>
    | { status: string; progress: number; created_at: string }
    | null;
};

function formatProjectRecord(project: RawProjectRecord): DashboardProject {
  const renderJobs = Array.isArray(project.render_jobs)
    ? project.render_jobs
    : project.render_jobs
    ? [project.render_jobs]
    : [];
  const latestRender =
    [...renderJobs].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;

  const settingsList = Array.isArray(project.project_settings)
    ? project.project_settings
    : project.project_settings
    ? [project.project_settings]
    : [];
  const setting = settingsList[0] ?? null;

  return {
    id: project.id,
    title: project.title,
    topic: project.topic,
    status: project.status,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    settings: setting
      ? {
          aspectRatio: setting.aspect_ratio || "16:9",
          durationSeconds: setting.target_duration_seconds || 60,
          voiceStyle: setting.voice_style,
          visualStyle: setting.visual_style,
        }
      : null,
    render: latestRender
      ? { status: latestRender.status, progress: latestRender.progress }
      : null,
  };
}

export async function getDashboardProjects(): Promise<DashboardProject[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from("projects")
      .select(
        "id,title,topic,status,created_at,updated_at,project_settings(aspect_ratio,target_duration_seconds,voice_style,visual_style),render_jobs(status,progress,created_at)"
      )
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn("Could not query projects from Supabase:", error.message);
      return [];
    }

    return ((data ?? []) as RawProjectRecord[]).map(formatProjectRecord);
  } catch (err) {
    console.error("Failed to load dashboard projects:", err);
    return [];
  }
}

export async function getProjectById(projectId: string): Promise<DashboardProject | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from("projects")
      .select(
        "id,title,topic,status,created_at,updated_at,project_settings(aspect_ratio,target_duration_seconds,voice_style,visual_style),render_jobs(status,progress,created_at)"
      )
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return formatProjectRecord(data as RawProjectRecord);
  } catch {
    return null;
  }
}

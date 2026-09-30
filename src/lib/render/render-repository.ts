import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";
import {
  loadScriptRecord,
  saveScriptRecord,
  loadScriptRecordServiceRole,
  saveScriptRecordServiceRole,
} from "@/lib/scripts/script-repository";
import type { RenderJobRecord, RenderPreflight, RenderStep } from "./types";
import { DEFAULT_COMPOSITION_SETTINGS } from "@/lib/editor/types";

interface OwnedProjectRow {
  id: string;
  title: string;
  owner_id: string;
}

export async function requireOwnedProjectForRender(
  projectId: string,
): Promise<OwnedProjectRow> {
  const supabase = await createClient();

  // Defense-in-depth: explicitly scope by owner_id in addition to RLS.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new AppError("Please sign in to continue.", "UNAUTHENTICATED", 401);
  }

  const { data, error } = await supabase
    .from("projects")
    .select("id,title,owner_id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    throw new AppError("The project could not be loaded.", "PROJECT_READ_FAILED", 500, error);
  }
  if (!data) {
    throw new AppError("You do not have access to that project.", "PROJECT_NOT_OWNED", 403);
  }
  return data as OwnedProjectRow;
}

export async function getRenderStudioData(
  projectId: string,
  ownerId: string,
): Promise<{
  preflight: RenderPreflight;
  activeJob: RenderJobRecord | null;
  recentJobs: RenderJobRecord[];
  projectTitle: string;
}> {
  const project = await requireOwnedProjectForRender(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  const supabase = await createClient();
  const { data: assets } = await supabase
    .from("assets")
    .select("id, media_type, assigned_scene_id")
    .eq("project_id", projectId);

  const assetList = (assets as { id: string; media_type: string; assigned_scene_id: string | null }[] | null) ?? [];

  const scenes = scriptRecord.document.scenes;
  const totalDuration = scenes.reduce((sum, s) => sum + (s.estimatedDurationSeconds || 15), 0);
  const assignedVisuals = scenes.filter((s) =>
    assetList.some((a) => a.assigned_scene_id === s.id && (a.media_type === "image" || a.media_type === "video")),
  ).length;

  const hasAudio =
    assetList.some((a) => a.media_type === "audio") ||
    Boolean(scriptRecord.document.audioSettings && Object.keys(scriptRecord.document.audioSettings).length > 0);

  const hasSubtitles = Boolean(
    scriptRecord.document.subtitles &&
      scriptRecord.document.subtitles.enabled &&
      scriptRecord.document.subtitles.cues.length > 0,
  );

  const settings = scriptRecord.document.compositionSettings ?? DEFAULT_COMPOSITION_SETTINGS;

  const preflight: RenderPreflight = {
    sceneCount: scenes.length,
    visualsReadyCount: assignedVisuals,
    totalDurationSeconds: totalDuration,
    hasAudio,
    hasSubtitles,
    resolution: settings.resolution,
    aspectRatio: settings.aspectRatio,
    isReadyToRender: scenes.length > 0,
  };

  const allJobs = scriptRecord.document.renderJobs ?? [];
  const sortedJobs = [...allJobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const activeJob =
    sortedJobs.find((j) => j.status === "queued" || j.status === "processing") ?? null;

  return {
    preflight,
    activeJob,
    recentJobs: sortedJobs,
    projectTitle: project.title,
  };
}

export async function createRenderJobRecord(
  projectId: string,
  ownerId: string,
): Promise<RenderJobRecord> {
  await requireOwnedProjectForRender(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  const scenes = scriptRecord.document.scenes;
  if (scenes.length === 0) {
    throw new AppError("Cannot render a project with zero scenes.", "RENDER_NO_SCENES", 400);
  }

  const settings = scriptRecord.document.compositionSettings ?? DEFAULT_COMPOSITION_SETTINGS;
  const totalDuration = scenes.reduce((sum, s) => sum + (s.estimatedDurationSeconds || 15), 0);

  const jobId = `render-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date().toISOString();

  const newJob: RenderJobRecord = {
    id: jobId,
    projectId,
    status: "processing",
    progress: 5,
    step: "analyzing_timeline",
    stepMessage: "Analyzing scene composition and transitions…",
    resolution: settings.resolution,
    aspectRatio: settings.aspectRatio,
    fps: settings.fps,
    durationSeconds: totalDuration,
    outputVideoUrl: null,
    outputFileSize: null,
    errorMessage: null,
    createdAt: now,
    completedAt: null,
  };

  const existingJobs = scriptRecord.document.renderJobs ?? [];
  const updatedDocument = {
    ...scriptRecord.document,
    renderJobs: [newJob, ...existingJobs.slice(0, 9)], // Retain last 10 jobs
  };

  await saveScriptRecord(projectId, ownerId, updatedDocument);
  return newJob;
}

export async function updateRenderJobProgress(params: {
  projectId: string;
  ownerId: string;
  jobId: string;
  step: RenderStep;
  progress: number;
  stepMessage: string;
  outputVideoUrl?: string | null;
  outputFileSize?: number | null;
  errorMessage?: string | null;
  isComplete?: boolean;
}): Promise<RenderJobRecord | null> {
  const {
    projectId,
    ownerId,
    jobId,
    step,
    progress,
    stepMessage,
    outputVideoUrl,
    outputFileSize,
    errorMessage,
    isComplete,
  } = params;

  await requireOwnedProjectForRender(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  let updatedJob: RenderJobRecord | null = null;
  const jobs = (scriptRecord.document.renderJobs ?? []).map((job) => {
    if (job.id !== jobId) return job;

    const isFailed = Boolean(errorMessage);
    const status = isFailed ? "failed" : isComplete ? "completed" : "processing";

    updatedJob = {
      ...job,
      status,
      step,
      progress,
      stepMessage,
      outputVideoUrl: outputVideoUrl !== undefined ? outputVideoUrl : job.outputVideoUrl,
      outputFileSize: outputFileSize !== undefined ? outputFileSize : job.outputFileSize,
      errorMessage: errorMessage ?? null,
      completedAt: isComplete || isFailed ? new Date().toISOString() : job.completedAt,
    };
    return updatedJob;
  });

  if (updatedJob) {
    await saveScriptRecord(projectId, ownerId, {
      ...scriptRecord.document,
      renderJobs: jobs,
    });
  }

  return updatedJob;
}

export async function cancelRenderJobRecord(
  projectId: string,
  ownerId: string,
  jobId: string,
): Promise<void> {
  await requireOwnedProjectForRender(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  const jobs = (scriptRecord.document.renderJobs ?? []).map((job) => {
    if (job.id !== jobId) return job;
    return {
      ...job,
      status: "cancelled" as const,
      stepMessage: "Rendering cancelled by user.",
      completedAt: new Date().toISOString(),
    };
  });

  await saveScriptRecord(projectId, ownerId, {
    ...scriptRecord.document,
    renderJobs: jobs,
  });
}

export async function getRenderJobRecordServiceRole(
  projectId: string,
  jobId: string,
): Promise<RenderJobRecord | null> {
  const scriptRecord = await loadScriptRecordServiceRole(projectId);
  const jobs = scriptRecord.document.renderJobs ?? [];
  return jobs.find((j) => j.id === jobId) ?? null;
}

export async function cancelRenderJobRecordServiceRole(
  projectId: string,
  jobId: string,
): Promise<void> {
  const scriptRecord = await loadScriptRecordServiceRole(projectId);
  const jobs = (scriptRecord.document.renderJobs ?? []).map((job) => {
    if (job.id !== jobId) return job;
    return {
      ...job,
      status: "cancelled" as const,
      stepMessage: "Rendering cancelled by user.",
      completedAt: new Date().toISOString(),
    };
  });

  await saveScriptRecordServiceRole(projectId, {
    ...scriptRecord.document,
    renderJobs: jobs,
  });
}

export async function updateRenderJobProgressServiceRole(params: {
  projectId: string;
  jobId: string;
  step: RenderStep;
  progress: number;
  stepMessage: string;
  outputVideoUrl?: string | null;
  outputFileSize?: number | null;
  errorMessage?: string | null;
  isComplete?: boolean;
}): Promise<RenderJobRecord | null> {
  const {
    projectId,
    jobId,
    step,
    progress,
    stepMessage,
    outputVideoUrl,
    outputFileSize,
    errorMessage,
    isComplete,
  } = params;

  const scriptRecord = await loadScriptRecordServiceRole(projectId);

  let updatedJob: RenderJobRecord | null = null;
  const jobs = (scriptRecord.document.renderJobs ?? []).map((job) => {
    if (job.id !== jobId) return job;

    const isFailed = Boolean(errorMessage);
    const status = isFailed ? ("failed" as const) : isComplete ? ("completed" as const) : ("processing" as const);

    updatedJob = {
      ...job,
      status,
      step,
      progress,
      stepMessage,
      outputVideoUrl: outputVideoUrl !== undefined ? outputVideoUrl : job.outputVideoUrl,
      outputFileSize: outputFileSize !== undefined ? outputFileSize : job.outputFileSize,
      errorMessage: errorMessage ?? null,
      completedAt: isComplete || isFailed ? new Date().toISOString() : job.completedAt,
    };
    return updatedJob;
  });

  if (updatedJob) {
    await saveScriptRecordServiceRole(projectId, {
      ...scriptRecord.document,
      renderJobs: jobs,
    });
  }

  return updatedJob;
}


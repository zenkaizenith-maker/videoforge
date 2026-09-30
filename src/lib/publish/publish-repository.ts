import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";
import { loadScriptRecord, saveScriptRecord } from "@/lib/scripts/script-repository";
import { generatePublishMetadata } from "./generator";
import type { PublishMetadata, PublishStudioData } from "./types";
import { DEFAULT_COMPOSITION_SETTINGS } from "@/lib/editor/types";
import { generateSrtContent, generateVttContent } from "@/lib/subtitles/types";

interface OwnedProjectRow {
  id: string;
  title: string;
  owner_id: string;
}

export async function requireOwnedProjectForPublish(
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

export async function getPublishStudioData(
  projectId: string,
  ownerId: string,
): Promise<PublishStudioData> {
  const project = await requireOwnedProjectForPublish(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  const doc = scriptRecord.document;
  const scenes = doc.scenes;
  const totalDuration = scenes.reduce((sum, s) => sum + (s.estimatedDurationSeconds || 15), 0);

  // Generate or read existing publish metadata
  const metadata: PublishMetadata =
    doc.publishMetadata ?? generatePublishMetadata(project.title, doc.hook, scenes);

  // Locate completed render job
  const completedJob =
    (doc.renderJobs ?? []).find((j) => j.status === "completed") ?? null;

  const settings = doc.compositionSettings ?? DEFAULT_COMPOSITION_SETTINGS;

  const isYouTubeConnected = Boolean(
    process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN,
  );

  const cues = doc.subtitles?.cues || [];
  const hasSubtitles = Boolean(doc.subtitles?.enabled && cues.length > 0);
  const srtContent = hasSubtitles ? generateSrtContent(cues) : null;
  const vttContent = hasSubtitles ? generateVttContent(cues) : null;

  return {
    projectId,
    projectTitle: project.title,
    metadata,
    masterVideoUrl: completedJob?.outputVideoUrl ?? null,
    videoDurationSeconds: completedJob?.durationSeconds ?? totalDuration,
    aspectRatio: completedJob?.aspectRatio ?? settings.aspectRatio,
    resolution: completedJob?.resolution ?? settings.resolution,
    isRendered: Boolean(completedJob),
    isYouTubeConnected,
    srtContent,
    vttContent,
  };
}

export async function savePublishMetadata(params: {
  projectId: string;
  ownerId: string;
  metadata: PublishMetadata;
  markPublished?: boolean;
}): Promise<PublishMetadata> {
  const { projectId, ownerId, metadata, markPublished } = params;
  await requireOwnedProjectForPublish(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  const isYouTubeConnected = Boolean(
    process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN,
  );

  // Only store actual youtubeVideoId if provided or if genuinely connected
  const youtubeVideoId = metadata.youtubeVideoId || null;

  const updatedMetadata: PublishMetadata = {
    ...metadata,
    publishedAt: markPublished ? new Date().toISOString() : metadata.publishedAt,
    youtubeVideoId,
  };

  const updatedDocument = {
    ...scriptRecord.document,
    publishMetadata: updatedMetadata,
  };

  await saveScriptRecord(projectId, ownerId, updatedDocument);

  // If marked published, update project status in public.projects
  if (markPublished) {
    const supabase = await createClient();
    await supabase
      .from("projects")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", projectId);
  }

  return updatedMetadata;
}


import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";
import { loadScriptRecord, saveScriptRecord } from "@/lib/scripts/script-repository";
import type { ScriptScene } from "@/lib/scripts/script-document";
import { generateSubtitlesFromScenes } from "./generator";
import type { SubtitleCue, SubtitleData, SubtitleStyle } from "./types";
import { DEFAULT_SUBTITLE_STYLE } from "./types";

interface OwnedProjectRow {
  id: string;
  title: string;
  owner_id: string;
}

export async function requireOwnedProjectForSubtitles(
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

export async function getProjectSubtitles(
  projectId: string,
  ownerId: string,
): Promise<{
  subtitles: SubtitleData;
  scenes: ScriptScene[];
  projectTitle: string;
}> {
  const project = await requireOwnedProjectForSubtitles(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  const scenes = scriptRecord.document.scenes;
  let subtitles = scriptRecord.document.subtitles;

  // If no subtitles have ever been generated, auto-populate from script scenes
  if (!subtitles || !subtitles.cues) {
    const generatedCues = generateSubtitlesFromScenes(scenes);
    subtitles = {
      enabled: generatedCues.length > 0,
      cues: generatedCues,
      style: DEFAULT_SUBTITLE_STYLE,
    };
  }

  return {
    subtitles,
    scenes,
    projectTitle: project.title,
  };
}

export async function saveProjectSubtitles(
  projectId: string,
  ownerId: string,
  subtitleData: SubtitleData,
): Promise<SubtitleData> {
  await requireOwnedProjectForSubtitles(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  // Sort cues chronologically by start time
  const sortedCues = [...subtitleData.cues].sort((a, b) => a.startTime - b.startTime);

  const cleanData: SubtitleData = {
    enabled: subtitleData.enabled,
    cues: sortedCues,
    style: subtitleData.style,
  };

  const updatedDocument = {
    ...scriptRecord.document,
    subtitles: cleanData,
  };

  await saveScriptRecord(projectId, ownerId, updatedDocument);
  return cleanData;
}

export async function regenerateProjectSubtitles(
  projectId: string,
  ownerId: string,
  styleOverride?: SubtitleStyle,
): Promise<SubtitleData> {
  await requireOwnedProjectForSubtitles(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  const generatedCues = generateSubtitlesFromScenes(scriptRecord.document.scenes);
  const style = styleOverride ?? scriptRecord.document.subtitles?.style ?? DEFAULT_SUBTITLE_STYLE;

  const newSubtitleData: SubtitleData = {
    enabled: generatedCues.length > 0,
    cues: generatedCues,
    style,
  };

  const updatedDocument = {
    ...scriptRecord.document,
    subtitles: newSubtitleData,
  };

  await saveScriptRecord(projectId, ownerId, updatedDocument);
  return newSubtitleData;
}

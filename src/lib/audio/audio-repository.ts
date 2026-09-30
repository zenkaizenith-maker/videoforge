import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";
import { createSupabaseStorageClient } from "@/lib/storage/supabase-storage-client";
import { loadScriptRecord, saveScriptRecord } from "@/lib/scripts/script-repository";
import type {
  AudioTrack,
  AudioCategory,
  AudioTrackSettings,
  AudioFilter,
} from "./types";
import { DEFAULT_CATEGORY_VOLUMES } from "./types";

interface AssetRow {
  id: string;
  project_id: string;
  original_filename: string;
  storage_path: string;
  media_type: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  assigned_scene_id: string | null;
  created_at: string;
  updated_at: string;
}

interface OwnedProjectRow {
  id: string;
  title: string;
  owner_id: string;
}

export async function requireOwnedProjectForAudio(projectId: string): Promise<OwnedProjectRow> {
  const supabase = await createClient();

  // Defense-in-depth: check owner_id explicitly in addition to RLS.
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

function inferCategoryFromFilename(filename: string): AudioCategory {
  const lower = filename.toLowerCase();
  if (lower.includes("voice") || lower.includes("narration") || lower.includes("vocal") || lower.includes("speech")) {
    return "narration";
  }
  if (lower.includes("sfx") || lower.includes("effect") || lower.includes("sound") || lower.includes("hit") || lower.includes("woosh") || lower.includes("transition")) {
    return "sfx";
  }
  return "music";
}

function mapToAudioTrack(row: AssetRow, settings?: AudioTrackSettings): AudioTrack {
  const category = settings?.category ?? inferCategoryFromFilename(row.original_filename);
  const volume = settings?.volume ?? DEFAULT_CATEGORY_VOLUMES[category];
  const isMuted = settings?.isMuted ?? false;
  const isLoop = settings?.isLoop ?? (category === "music");

  return {
    id: row.id,
    projectId: row.project_id,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    durationSeconds: row.duration_seconds,
    category,
    volume,
    isMuted,
    isLoop,
    assignedSceneId: row.assigned_scene_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProjectAudioTracks(
  projectId: string,
  ownerId: string,
  filter: AudioFilter = "all",
): Promise<AudioTrack[]> {
  await requireOwnedProjectForAudio(projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("project_id", projectId)
    .eq("media_type", "audio")
    .order("created_at", { ascending: false });

  if (error) {
    throw new AppError("Audio tracks could not be loaded.", "AUDIO_READ_FAILED", 500, error);
  }

  const scriptRecord = await loadScriptRecord(projectId, ownerId).catch(() => null);
  const audioSettingsMap = scriptRecord?.document.audioSettings ?? {};

  const rows = (data as AssetRow[] | null) ?? [];
  let tracks = rows.map((row) => mapToAudioTrack(row, audioSettingsMap[row.id]));

  if (filter === "narration") {
    tracks = tracks.filter((t) => t.category === "narration");
  } else if (filter === "music") {
    tracks = tracks.filter((t) => t.category === "music");
  } else if (filter === "sfx") {
    tracks = tracks.filter((t) => t.category === "sfx");
  } else if (filter === "unassigned") {
    tracks = tracks.filter((t) => !t.assignedSceneId);
  }

  return tracks;
}

export async function getAudioTrackById(
  projectId: string,
  trackId: string,
  ownerId: string,
): Promise<AudioTrack | null> {
  await requireOwnedProjectForAudio(projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("id", trackId)
    .eq("project_id", projectId)
    .eq("media_type", "audio")
    .maybeSingle();

  if (error) {
    throw new AppError("Audio track could not be loaded.", "AUDIO_READ_FAILED", 500, error);
  }
  if (!data) return null;

  const scriptRecord = await loadScriptRecord(projectId, ownerId).catch(() => null);
  const settings = scriptRecord?.document.audioSettings?.[trackId];

  return mapToAudioTrack(data as AssetRow, settings);
}

export async function insertAudioTrack(params: {
  projectId: string;
  ownerId: string;
  file: File;
  category: AudioCategory;
  sceneId?: string | null;
  durationSeconds?: number | null;
}): Promise<AudioTrack> {
  const { projectId, ownerId, file, category, sceneId, durationSeconds } = params;
  await requireOwnedProjectForAudio(projectId);

  const storageClient = createSupabaseStorageClient();
  const { path } = await storageClient.upload({ projectId, file });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .insert({
      project_id: projectId,
      original_filename: file.name,
      storage_path: path,
      media_type: "audio",
      mime_type: file.type || "audio/mpeg",
      file_size: file.size,
      duration_seconds: durationSeconds ?? null,
      assigned_scene_id: sceneId ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    // Attempt rollback of uploaded file if metadata insert fails
    try {
      await storageClient.delete(path);
    } catch {
      // Ignore cleanup error
    }
    throw new AppError("Failed to save audio track metadata.", "AUDIO_SAVE_FAILED", 500, error);
  }

  const assetRow = data as AssetRow;
  const initialSettings: AudioTrackSettings = {
    category,
    volume: DEFAULT_CATEGORY_VOLUMES[category],
    isMuted: false,
    isLoop: category === "music",
  };

  // Persist track settings into script document envelope
  try {
    const scriptRecord = await loadScriptRecord(projectId, ownerId);
    const existingSettings = scriptRecord.document.audioSettings ?? {};
    const updatedDocument = {
      ...scriptRecord.document,
      audioSettings: {
        ...existingSettings,
        [assetRow.id]: initialSettings,
      },
    };
    await saveScriptRecord(projectId, ownerId, updatedDocument);
  } catch (err) {
    console.warn("Could not sync audio track settings to script document:", err);
  }

  return mapToAudioTrack(assetRow, initialSettings);
}

/**
 * Creates an audio track DB record from an already-uploaded storage path.
 * Used by the direct-upload flow where the browser PUT the binary directly
 * to Supabase Storage using a signed upload URL.
 */
export async function insertAudioTrackFromPath(params: {
  projectId: string;
  ownerId: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  category: AudioCategory;
  sceneId?: string | null;
}): Promise<AudioTrack> {
  const { projectId, ownerId, storagePath, originalFilename, mimeType, fileSize, category, sceneId } = params;
  await requireOwnedProjectForAudio(projectId);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .insert({
      project_id: projectId,
      original_filename: originalFilename,
      storage_path: storagePath,
      media_type: "audio",
      mime_type: mimeType || "audio/mpeg",
      file_size: fileSize,
      duration_seconds: null,
      assigned_scene_id: sceneId ?? null,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new AppError("Failed to save audio track metadata.", "AUDIO_SAVE_FAILED", 500, error);
  }

  const assetRow = data as AssetRow;
  const initialSettings: AudioTrackSettings = {
    category,
    volume: DEFAULT_CATEGORY_VOLUMES[category],
    isMuted: false,
    isLoop: category === "music",
  };

  // Persist track settings into script document envelope
  try {
    const scriptRecord = await loadScriptRecord(projectId, ownerId);
    const existingSettings = scriptRecord.document.audioSettings ?? {};
    const updatedDocument = {
      ...scriptRecord.document,
      audioSettings: {
        ...existingSettings,
        [assetRow.id]: initialSettings,
      },
    };
    await saveScriptRecord(projectId, ownerId, updatedDocument);
  } catch (err) {
    console.warn("Could not sync audio track settings to script document:", err);
  }

  return mapToAudioTrack(assetRow, initialSettings);
}

export async function updateAudioTrackRecord(params: {
  projectId: string;
  ownerId: string;
  trackId: string;
  category?: AudioCategory;
  volume?: number;
  isMuted?: boolean;
  isLoop?: boolean;
  assignedSceneId?: string | null;
}): Promise<AudioTrack> {
  const { projectId, ownerId, trackId, category, volume, isMuted, isLoop, assignedSceneId } = params;
  await requireOwnedProjectForAudio(projectId);

  const supabase = await createClient();

  // If assignedSceneId was explicitly provided (can be string or null), update the asset row
  let rowUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (assignedSceneId !== undefined) {
    rowUpdate.assigned_scene_id = assignedSceneId;
  }

  const { data, error } = await supabase
    .from("assets")
    .update(rowUpdate)
    .eq("id", trackId)
    .eq("project_id", projectId)
    .eq("media_type", "audio")
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new AppError("Audio track could not be updated.", "AUDIO_UPDATE_FAILED", 500, error);
  }

  // Update audioSettings in script document if any mixing attribute changed
  const scriptRecord = await loadScriptRecord(projectId, ownerId);
  const currentSettings = scriptRecord.document.audioSettings?.[trackId] ?? {
    category: inferCategoryFromFilename((data as AssetRow).original_filename),
    volume: DEFAULT_CATEGORY_VOLUMES.music,
    isMuted: false,
    isLoop: true,
  };

  const updatedSettings: AudioTrackSettings = {
    category: category ?? currentSettings.category,
    volume: volume !== undefined ? volume : currentSettings.volume,
    isMuted: isMuted !== undefined ? isMuted : currentSettings.isMuted,
    isLoop: isLoop !== undefined ? isLoop : currentSettings.isLoop,
  };

  try {
    const updatedDocument = {
      ...scriptRecord.document,
      audioSettings: {
        ...(scriptRecord.document.audioSettings ?? {}),
        [trackId]: updatedSettings,
      },
    };
    await saveScriptRecord(projectId, ownerId, updatedDocument);
  } catch (err) {
    console.warn("Could not save audio settings into script document:", err);
  }

  return mapToAudioTrack(data as AssetRow, updatedSettings);
}

export async function deleteAudioTrackRecord(
  projectId: string,
  ownerId: string,
  trackId: string,
): Promise<void> {
  await requireOwnedProjectForAudio(projectId);
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("assets")
    .select("storage_path")
    .eq("id", trackId)
    .eq("project_id", projectId)
    .eq("media_type", "audio")
    .maybeSingle();

  if (readError || !existing) {
    throw new AppError("Audio track not found.", "AUDIO_NOT_FOUND", 404, readError);
  }

  const storageClient = createSupabaseStorageClient();
  try {
    await storageClient.delete((existing as { storage_path: string }).storage_path);
  } catch {
    // Continue even if storage delete failed
  }

  const { error: deleteError } = await supabase
    .from("assets")
    .delete()
    .eq("id", trackId)
    .eq("project_id", projectId);

  if (deleteError) {
    throw new AppError("Could not delete audio track record.", "AUDIO_DELETE_FAILED", 500, deleteError);
  }

  // Clean up settings from script document
  try {
    const scriptRecord = await loadScriptRecord(projectId, ownerId);
    if (scriptRecord.document.audioSettings?.[trackId]) {
      const nextSettings = { ...scriptRecord.document.audioSettings };
      delete nextSettings[trackId];
      const updatedDocument = {
        ...scriptRecord.document,
        audioSettings: nextSettings,
      };
      await saveScriptRecord(projectId, ownerId, updatedDocument);
    }
  } catch (err) {
    console.warn("Could not clean audio settings from script document:", err);
  }
}

export async function getSignedAudioUrl(projectId: string, trackId: string): Promise<string> {
  await requireOwnedProjectForAudio(projectId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("assets")
    .select("storage_path")
    .eq("id", trackId)
    .eq("project_id", projectId)
    .eq("media_type", "audio")
    .maybeSingle();

  if (error || !data) {
    throw new AppError("Audio track not found.", "AUDIO_NOT_FOUND", 404, error);
  }

  const storageClient = createSupabaseStorageClient();
  return storageClient.createSignedUrl((data as { storage_path: string }).storage_path, 3600);
}

import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";
import { createSupabaseStorageClient } from "@/lib/storage/supabase-storage-client";
import { loadScriptRecord, saveScriptRecord } from "@/lib/scripts/script-repository";
import type {
  CompositionSettings,
  EditorSceneClip,
  EditorWorkspaceData,
  MotionEffect,
  TransitionType,
} from "./types";
import { DEFAULT_COMPOSITION_SETTINGS } from "./types";

interface OwnedProjectRow {
  id: string;
  title: string;
  owner_id: string;
}

interface AssetRow {
  id: string;
  project_id: string;
  original_filename: string;
  storage_path: string;
  media_type: string;
  assigned_scene_id: string | null;
}

export async function requireOwnedProjectForEditor(
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

export async function loadEditorWorkspace(
  projectId: string,
  ownerId: string,
): Promise<EditorWorkspaceData> {
  const project = await requireOwnedProjectForEditor(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  const supabase = await createClient();
  const { data: assetRows, error: assetError } = await supabase
    .from("assets")
    .select("id, project_id, original_filename, storage_path, media_type, assigned_scene_id")
    .eq("project_id", projectId)
    .in("media_type", ["image", "video"]);

  if (assetError) {
    throw new AppError("Could not load visual assets.", "ASSETS_READ_FAILED", 500, assetError);
  }

  const assets = (assetRows as AssetRow[] | null) ?? [];
  const storageClient = createSupabaseStorageClient();

  // Create signed URLs for visual assets concurrently
  const assetUrlMap = new Map<string, string>();
  await Promise.all(
    assets.map(async (asset) => {
      try {
        const url = await storageClient.createSignedUrl(asset.storage_path, 3600);
        assetUrlMap.set(asset.id, url);
      } catch {
        // Continue if a signed URL fails
      }
    }),
  );

  const scenes = scriptRecord.document.scenes;
  let totalDuration = 0;

  const clips: EditorSceneClip[] = scenes.map((scene) => {
    const assignedAsset = assets.find((a) => a.assigned_scene_id === scene.id) || null;
    const duration = scene.estimatedDurationSeconds || 15;
    totalDuration += duration;

    return {
      id: scene.id,
      title: scene.title,
      narration: scene.narration,
      visualDirection: scene.visualDirection,
      durationSeconds: duration,
      assignedAssetId: assignedAsset?.id ?? null,
      assignedAssetUrl: assignedAsset ? assetUrlMap.get(assignedAsset.id) ?? null : null,
      assignedAssetType: assignedAsset ? (assignedAsset.media_type as "image" | "video") : null,
      transition: scene.transition || "dissolve",
      transitionDurationSeconds: scene.transitionDurationSeconds ?? 0.8,
      motionEffect: scene.motionEffect || "zoom-in",
    };
  });

  const settings: CompositionSettings =
    scriptRecord.document.compositionSettings ?? DEFAULT_COMPOSITION_SETTINGS;

  const availableAssets = assets.map((a) => ({
    id: a.id,
    originalFilename: a.original_filename,
    mediaType: a.media_type as "image" | "video",
    signedUrl: assetUrlMap.get(a.id),
  }));

  return {
    projectId,
    projectTitle: project.title,
    clips,
    settings,
    availableAssets,
    totalDurationSeconds: totalDuration,
  };
}

export async function updateClipProperties(params: {
  projectId: string;
  ownerId: string;
  sceneId: string;
  durationSeconds?: number;
  transition?: TransitionType;
  transitionDurationSeconds?: number;
  motionEffect?: MotionEffect;
  assignedAssetId?: string | null;
}): Promise<void> {
  const {
    projectId,
    ownerId,
    sceneId,
    durationSeconds,
    transition,
    transitionDurationSeconds,
    motionEffect,
    assignedAssetId,
  } = params;

  await requireOwnedProjectForEditor(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  // Update scene metadata in script document
  const updatedScenes = scriptRecord.document.scenes.map((s) => {
    if (s.id !== sceneId) return s;
    return {
      ...s,
      estimatedDurationSeconds: durationSeconds !== undefined ? durationSeconds : s.estimatedDurationSeconds,
      transition: transition !== undefined ? transition : s.transition,
      transitionDurationSeconds:
        transitionDurationSeconds !== undefined ? transitionDurationSeconds : s.transitionDurationSeconds,
      motionEffect: motionEffect !== undefined ? motionEffect : s.motionEffect,
    };
  });

  await saveScriptRecord(projectId, ownerId, {
    ...scriptRecord.document,
    scenes: updatedScenes,
  });

  // If assignedAssetId was passed, update database public.assets rows
  if (assignedAssetId !== undefined) {
    const supabase = await createClient();

    // Remove previous asset assigned to this scene
    await supabase
      .from("assets")
      .update({ assigned_scene_id: null, updated_at: new Date().toISOString() })
      .eq("project_id", projectId)
      .eq("assigned_scene_id", sceneId);

    // Assign new asset if not null
    if (assignedAssetId) {
      await supabase
        .from("assets")
        .update({ assigned_scene_id: sceneId, updated_at: new Date().toISOString() })
        .eq("id", assignedAssetId)
        .eq("project_id", projectId);
    }
  }
}

export async function saveCompositionSettings(params: {
  projectId: string;
  ownerId: string;
  settings: CompositionSettings;
}): Promise<CompositionSettings> {
  const { projectId, ownerId, settings } = params;
  await requireOwnedProjectForEditor(projectId);
  const scriptRecord = await loadScriptRecord(projectId, ownerId);

  const updatedDocument = {
    ...scriptRecord.document,
    compositionSettings: settings,
  };

  await saveScriptRecord(projectId, ownerId, updatedDocument);
  return settings;
}

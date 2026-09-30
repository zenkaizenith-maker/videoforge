import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";
import type { AssetRecord, AssetFilter } from "./types";

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

function mapRow(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    mediaType: row.media_type as AssetRecord["mediaType"],
    mimeType: row.mime_type,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    assignedSceneId: row.assigned_scene_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function requireOwnedProjectForAssets(projectId: string): Promise<OwnedProjectRow> {
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

export async function listProjectAssets(
  projectId: string,
  filter: AssetFilter = "all",
  search: string = "",
): Promise<AssetRecord[]> {
  const supabase = await createClient();
  let query = supabase
    .from("assets")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (filter === "image") {
    query = query.eq("media_type", "image");
  } else if (filter === "video") {
    query = query.eq("media_type", "video");
  } else if (filter === "audio") {
    query = query.eq("media_type", "audio");
  } else if (filter === "unassigned") {
    query = query.or("assigned_scene_id.is.null,assigned_scene_id.eq.");
  }

  if (search.trim()) {
    query = query.ilike("original_filename", `%${search.trim()}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw new AppError("Assets could not be loaded.", "ASSETS_READ_FAILED", 500, error);
  }

  return (data as AssetRow[] | null)?.map(mapRow) ?? [];
}

export async function getAssetById(projectId: string, assetId: string): Promise<AssetRecord | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("id", assetId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw new AppError("Asset could not be loaded.", "ASSET_READ_FAILED", 500, error);
  }
  if (!data) return null;
  return mapRow(data as AssetRow);
}

export async function insertAssetRecord(record: {
  projectId: string;
  originalFilename: string;
  storagePath: string;
  mediaType: AssetRecord["mediaType"];
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}): Promise<AssetRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .insert({
      project_id: record.projectId,
      original_filename: record.originalFilename,
      storage_path: record.storagePath,
      media_type: record.mediaType,
      mime_type: record.mimeType,
      file_size: record.fileSize,
      width: record.width,
      height: record.height,
      duration_seconds: record.durationSeconds,
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new AppError("Asset metadata could not be saved.", "ASSET_SAVE_FAILED", 500, error);
  }

  return mapRow(data as AssetRow);
}

export async function updateAssetAssignment(
  projectId: string,
  assetId: string,
  sceneId: string | null,
): Promise<AssetRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .update({ assigned_scene_id: sceneId, updated_at: new Date().toISOString() })
    .eq("id", assetId)
    .eq("project_id", projectId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    throw new AppError("Asset assignment could not be updated.", "ASSET_UPDATE_FAILED", 500, error);
  }

  return mapRow(data as AssetRow);
}

export async function deleteAssetRecord(projectId: string, assetId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("assets")
    .delete()
    .eq("id", assetId)
    .eq("project_id", projectId);

  if (error) {
    throw new AppError("Asset could not be deleted.", "ASSET_DELETE_FAILED", 500, error);
  }
}

export async function getProjectAssetTotalSize(projectId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assets")
    .select("file_size")
    .eq("project_id", projectId);

  if (error) {
    return 0;
  }

  return (data as { file_size: number }[] | null)?.reduce((sum, row) => sum + row.file_size, 0) ?? 0;
}

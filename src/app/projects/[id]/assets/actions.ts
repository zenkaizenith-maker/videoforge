"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { toAppError } from "@/lib/errors/app-error";
import {
  createSupabaseStorageClient,
  createSignedUploadUrl,
} from "@/lib/storage/supabase-storage-client";

import {
  deleteAssetRecord,
  getAssetById,
  getProjectAssetTotalSize,
  insertAssetRecord,
  listProjectAssets,
  requireOwnedProjectForAssets,
  updateAssetAssignment,
} from "@/lib/assets/asset-repository";
import {
  assetFilterSchema,
  assignAssetSchema,
  deleteAssetSchema,
  uploadAssetSchema,
} from "@/lib/validation/asset";
import type { AssetRecord, AssetFilter } from "@/lib/assets/types";

export type AssetActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function extractMediaMetadata(file: File): {
  mediaType: AssetRecord["mediaType"];
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
} {
  const mediaType =
    file.type.startsWith("image/")
      ? "image"
      : file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("audio/")
          ? "audio"
          : "image";

  return { mediaType, width: null, height: null, durationSeconds: null };
}

export async function loadAssets(
  projectId: string,
  filter: AssetFilter = "all",
  search: string = "",
): Promise<
  AssetActionResult<{
    assets: AssetRecord[];
    projectId: string;
    projectTitle: string;
    totalSizeBytes: number;
  }>
> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const parsedFilter = assetFilterSchema.safeParse({ filter, search });
    if (!parsedFilter.success) {
      return { ok: false, error: "Invalid filter." };
    }

    const project = await requireOwnedProjectForAssets(projectId);
    const assets = await listProjectAssets(projectId, parsedFilter.data.filter, parsedFilter.data.search);
    const totalSizeBytes = await getProjectAssetTotalSize(projectId);

    return {
      ok: true,
      data: { assets, projectId, projectTitle: project.title, totalSizeBytes },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function uploadAsset(
  input: unknown,
): Promise<AssetActionResult<{ asset: AssetRecord }>> {
  try {
    const formData = input instanceof FormData ? input : null;
    if (!formData) {
      return { ok: false, error: "Invalid upload payload." };
    }

    const projectId = (formData.get("projectId") as string)?.trim() ?? "";
    const file = formData.get("file") as File | null;

    if (!projectId) {
      return { ok: false, error: "A project is required." };
    }
    if (!file) {
      return { ok: false, error: "A file is required." };
    }

    const parsedFile = uploadAssetSchema.shape.file.safeParse(file);
    if (!parsedFile.success) {
      return { ok: false, error: parsedFile.error.issues[0]?.message ?? "Unsupported file." };
    }

    const ownerId = await requireAuthenticatedUserId();
    await requireOwnedProjectForAssets(projectId);

    const storageClient = createSupabaseStorageClient();
    const { path } = await storageClient.upload({ projectId, file });
    const metadata = extractMediaMetadata(file);

    const asset = await insertAssetRecord({
      projectId,
      originalFilename: file.name,
      storagePath: path,
      mediaType: metadata.mediaType,
      mimeType: file.type,
      fileSize: file.size,
      width: metadata.width,
      height: metadata.height,
      durationSeconds: metadata.durationSeconds,
    });

    revalidatePath(`/projects/${projectId}/assets`);
    return { ok: true, data: { asset } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function assignAsset(
  input: unknown,
): Promise<AssetActionResult<{ asset: AssetRecord }>> {
  try {
    const parsed = assignAssetSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid assignment." };
    }

    const ownerId = await requireAuthenticatedUserId();
    const { projectId, assetId, sceneId } = parsed.data;
    await requireOwnedProjectForAssets(projectId);
    const asset = await updateAssetAssignment(projectId, assetId, sceneId ?? null);

    revalidatePath(`/projects/${projectId}/assets`);
    return { ok: true, data: { asset } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function removeAssetAssignment(
  input: unknown,
): Promise<AssetActionResult<{ asset: AssetRecord }>> {
  try {
    const parsed = assignAssetSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid assignment." };
    }

    const ownerId = await requireAuthenticatedUserId();
    const { projectId, assetId } = parsed.data;
    await requireOwnedProjectForAssets(projectId);
    const asset = await updateAssetAssignment(projectId, assetId, null);

    revalidatePath(`/projects/${projectId}/assets`);
    return { ok: true, data: { asset } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function deleteAsset(
  input: unknown,
): Promise<AssetActionResult<{ id: string }>> {
  try {
    const parsed = deleteAssetSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
    }

    const ownerId = await requireAuthenticatedUserId();
    const { projectId, assetId } = parsed.data;
    const existing = await getAssetById(projectId, assetId);
    if (!existing) {
      return { ok: false, error: "Asset not found." };
    }

    const storageClient = createSupabaseStorageClient();
    try {
      await storageClient.delete(existing.storagePath);
    } catch {
      // Continue even if storage deletion fails; DB record still gets removed.
    }

    await deleteAssetRecord(projectId, assetId);
    revalidatePath(`/projects/${projectId}/assets`);
    return { ok: true, data: { id: assetId } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function getSignedAssetUrl(
  projectId: string,
  assetId: string,
): Promise<AssetActionResult<{ url: string }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    await requireOwnedProjectForAssets(projectId);
    const asset = await getAssetById(projectId, assetId);
    if (!asset) {
      return { ok: false, error: "Asset not found." };
    }

    const storageClient = createSupabaseStorageClient();
    const url = await storageClient.createSignedUrl(asset.storagePath, 3600);
    return { ok: true, data: { url } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

/**
 * Step 1 of the direct-upload flow.
 * Server verifies project ownership and returns a short-lived Supabase signed
 * upload URL. The browser uses this URL to PUT the file directly to Supabase
 * Storage — the binary never passes through a Next.js function.
 */
export async function requestSignedUploadUrl(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}): Promise<AssetActionResult<{ uploadUrl: string; storagePath: string }>> {
  try {
    const { projectId, filename, mimeType, fileSize } = input;

    if (!projectId) return { ok: false, error: "A project is required." };
    if (!filename) return { ok: false, error: "A filename is required." };
    if (fileSize <= 0) return { ok: false, error: "Invalid file size." };
    if (fileSize > 500 * 1024 * 1024) {
      return { ok: false, error: "File exceeds the 500 MB size limit." };
    }

    await requireAuthenticatedUserId();
    await requireOwnedProjectForAssets(projectId);

    const extension = filename.split(".").pop()?.toLowerCase() ?? "bin";
    const storagePath = `${projectId}/${crypto.randomUUID()}.${extension}`;
    void mimeType; // stored later in confirmAssetUpload

    const { uploadUrl } = await createSignedUploadUrl(storagePath);
    return { ok: true, data: { uploadUrl, storagePath } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

/**
 * Step 2 of the direct-upload flow.
 * Called by the browser after a successful PUT to the signed URL.
 * Registers the asset record in the database.
 */
export async function confirmAssetUpload(input: {
  projectId: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
}): Promise<AssetActionResult<{ asset: AssetRecord }>> {
  try {
    const { projectId, storagePath, originalFilename, mimeType, fileSize } = input;

    if (!projectId || !storagePath || !originalFilename) {
      return { ok: false, error: "Missing required fields." };
    }

    // Prevent path traversal — storagePath must be scoped to this project.
    if (!storagePath.startsWith(`${projectId}/`)) {
      return { ok: false, error: "Invalid storage path." };
    }

    await requireAuthenticatedUserId();
    await requireOwnedProjectForAssets(projectId);

    // Determine mediaType from mimeType
    const mediaType: AssetRecord["mediaType"] = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("video/")
        ? "video"
        : mimeType.startsWith("audio/")
          ? "audio"
          : "image";

    const asset = await insertAssetRecord({
      projectId,
      originalFilename,
      storagePath,
      mediaType,
      mimeType,
      fileSize,
      width: null,
      height: null,
      durationSeconds: null,
    });

    revalidatePath(`/projects/${projectId}/assets`);
    return { ok: true, data: { asset } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

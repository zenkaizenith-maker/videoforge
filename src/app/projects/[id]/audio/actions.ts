"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { toAppError } from "@/lib/errors/app-error";
import {
  deleteAudioTrackRecord,
  getSignedAudioUrl,
  insertAudioTrack,
  insertAudioTrackFromPath,
  listProjectAudioTracks,
  requireOwnedProjectForAudio,
  updateAudioTrackRecord,
} from "@/lib/audio/audio-repository";
import {
  audioCategorySchema,
  deleteAudioTrackSchema,
  updateAudioTrackSchema,
  uploadAudioSchema,
} from "@/lib/audio/validation";
import { createSignedUploadUrl } from "@/lib/storage/supabase-storage-client";
import type { AudioFilter, AudioTrack } from "@/lib/audio/types";
import type { AudioCategory } from "@/lib/audio/types";


export type AudioActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadAudioTracks(
  projectId: string,
  filter: AudioFilter = "all",
): Promise<
  AudioActionResult<{
    tracks: AudioTrack[];
    projectId: string;
    projectTitle: string;
  }>
> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const project = await requireOwnedProjectForAudio(projectId);
    const tracks = await listProjectAudioTracks(projectId, ownerId, filter);

    return {
      ok: true,
      data: {
        tracks,
        projectId,
        projectTitle: project.title,
      },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function uploadAudio(
  input: unknown,
): Promise<AudioActionResult<{ track: AudioTrack }>> {
  try {
    const formData = input instanceof FormData ? input : null;
    if (!formData) {
      return { ok: false, error: "Invalid upload payload." };
    }

    const projectId = (formData.get("projectId") as string)?.trim() ?? "";
    const rawCategory = (formData.get("category") as string)?.trim() ?? "music";
    const rawSceneId = (formData.get("sceneId") as string)?.trim() || null;
    const file = formData.get("file") as File | null;

    if (!projectId) {
      return { ok: false, error: "A project is required." };
    }
    if (!file) {
      return { ok: false, error: "An audio file is required." };
    }

    const parsedCategory = audioCategorySchema.safeParse(rawCategory);
    const category = parsedCategory.success ? parsedCategory.data : "music";

    const parsedFile = uploadAudioSchema.shape.file.safeParse(file);
    if (!parsedFile.success) {
      return { ok: false, error: parsedFile.error.issues[0]?.message ?? "Invalid audio file." };
    }

    const ownerId = await requireAuthenticatedUserId();
    const track = await insertAudioTrack({
      projectId,
      ownerId,
      file,
      category,
      sceneId: rawSceneId,
    });

    revalidatePath(`/projects/${projectId}/audio`);
    return { ok: true, data: { track } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function updateAudioTrack(
  input: unknown,
): Promise<AudioActionResult<{ track: AudioTrack }>> {
  try {
    const parsed = updateAudioTrackSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid track update." };
    }

    const ownerId = await requireAuthenticatedUserId();
    const { projectId, trackId, category, volume, isMuted, isLoop, assignedSceneId } = parsed.data;

    const track = await updateAudioTrackRecord({
      projectId,
      ownerId,
      trackId,
      category,
      volume,
      isMuted,
      isLoop,
      assignedSceneId,
    });

    revalidatePath(`/projects/${projectId}/audio`);
    return { ok: true, data: { track } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function deleteAudioTrack(
  input: unknown,
): Promise<AudioActionResult<{ id: string }>> {
  try {
    const parsed = deleteAudioTrackSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
    }

    const ownerId = await requireAuthenticatedUserId();
    const { projectId, trackId } = parsed.data;

    await deleteAudioTrackRecord(projectId, ownerId, trackId);
    revalidatePath(`/projects/${projectId}/audio`);
    return { ok: true, data: { id: trackId } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function getSignedAudioUrlAction(
  projectId: string,
  trackId: string,
): Promise<AudioActionResult<{ url: string }>> {
  try {
    await requireAuthenticatedUserId();
    const url = await getSignedAudioUrl(projectId, trackId);
    return { ok: true, data: { url } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

/**
 * Step 1 of the direct audio upload flow.
 * Verifies project ownership and returns a signed upload URL.
 * The browser PUTs the audio binary directly to Supabase Storage.
 */
export async function requestSignedAudioUploadUrl(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}): Promise<AudioActionResult<{ uploadUrl: string; storagePath: string }>> {
  try {
    const { projectId, filename, mimeType, fileSize } = input;
    void mimeType;

    if (!projectId) return { ok: false, error: "A project is required." };
    if (!filename) return { ok: false, error: "A filename is required." };
    if (fileSize <= 0) return { ok: false, error: "Invalid file size." };
    if (fileSize > 200 * 1024 * 1024) {
      return { ok: false, error: "Audio file exceeds the 200 MB size limit." };
    }

    await requireAuthenticatedUserId();
    await requireOwnedProjectForAudio(projectId);

    const extension = filename.split(".").pop()?.toLowerCase() ?? "mp3";
    const storagePath = `${projectId}/${crypto.randomUUID()}.${extension}`;
    const { uploadUrl } = await createSignedUploadUrl(storagePath);
    return { ok: true, data: { uploadUrl, storagePath } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

/**
 * Step 2 of the direct audio upload flow.
 * Called after the browser PUT to the signed URL completes.
 * Registers the audio track record in the database.
 */
export async function confirmAudioUpload(input: {
  projectId: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  category: AudioCategory;
  sceneId?: string | null;
}): Promise<AudioActionResult<{ track: AudioTrack }>> {
  try {
    const { projectId, storagePath, originalFilename, mimeType, fileSize, category, sceneId } = input;

    if (!projectId || !storagePath || !originalFilename) {
      return { ok: false, error: "Missing required fields." };
    }

    // Prevent path traversal — storagePath must be scoped to this project.
    if (!storagePath.startsWith(`${projectId}/`)) {
      return { ok: false, error: "Invalid storage path." };
    }

    const parsedCategory = audioCategorySchema.safeParse(category);
    const resolvedCategory: AudioCategory = parsedCategory.success ? parsedCategory.data : "music";

    const ownerId = await requireAuthenticatedUserId();

    const track = await insertAudioTrackFromPath({
      projectId,
      ownerId,
      storagePath,
      originalFilename,
      mimeType: mimeType || "audio/mpeg",
      fileSize,
      category: resolvedCategory,
      sceneId: sceneId ?? null,
    });

    revalidatePath(`/projects/${projectId}/audio`);
    return { ok: true, data: { track } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { toAppError } from "@/lib/errors/app-error";
import {
  loadEditorWorkspace,
  saveCompositionSettings,
  updateClipProperties,
} from "@/lib/editor/editor-repository";
import {
  saveCompositionSettingsSchema,
  updateClipPropertiesSchema,
} from "@/lib/editor/validation";
import type { CompositionSettings, EditorWorkspaceData } from "@/lib/editor/types";

export type EditorActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadEditor(
  projectId: string,
): Promise<EditorActionResult<EditorWorkspaceData>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const workspace = await loadEditorWorkspace(projectId, ownerId);
    return { ok: true, data: workspace };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function updateClip(
  input: unknown,
): Promise<EditorActionResult<{ success: boolean }>> {
  try {
    const parsed = updateClipPropertiesSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid clip parameters." };
    }

    const ownerId = await requireAuthenticatedUserId();
    const {
      projectId,
      sceneId,
      durationSeconds,
      transition,
      transitionDurationSeconds,
      motionEffect,
      assignedAssetId,
    } = parsed.data;

    await updateClipProperties({
      projectId,
      ownerId,
      sceneId,
      durationSeconds,
      transition,
      transitionDurationSeconds,
      motionEffect,
      assignedAssetId,
    });

    revalidatePath(`/projects/${projectId}/editor`);
    return { ok: true, data: { success: true } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function saveSettings(
  input: unknown,
): Promise<EditorActionResult<{ settings: CompositionSettings }>> {
  try {
    const parsed = saveCompositionSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid composition settings." };
    }

    const ownerId = await requireAuthenticatedUserId();
    const { projectId, settings } = parsed.data;

    const saved = await saveCompositionSettings({
      projectId,
      ownerId,
      settings,
    });

    revalidatePath(`/projects/${projectId}/editor`);
    return { ok: true, data: { settings: saved } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

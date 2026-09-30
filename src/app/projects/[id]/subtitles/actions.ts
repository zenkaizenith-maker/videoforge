"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { toAppError } from "@/lib/errors/app-error";
import {
  getProjectSubtitles,
  regenerateProjectSubtitles,
  saveProjectSubtitles,
} from "@/lib/subtitles/subtitle-repository";
import { saveSubtitlesSchema } from "@/lib/subtitles/validation";
import {
  generateSrtContent,
  generateVttContent,
  type SubtitleData,
} from "@/lib/subtitles/types";
import type { ScriptScene } from "@/lib/scripts/script-document";

export type SubtitleActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadSubtitles(projectId: string): Promise<
  SubtitleActionResult<{
    subtitles: SubtitleData;
    scenes: { id: string; title: string; estimatedDurationSeconds: number }[];
    projectId: string;
    projectTitle: string;
  }>
> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const data = await getProjectSubtitles(projectId, ownerId);

    const mappedScenes = data.scenes.map((s) => ({
      id: s.id,
      title: s.title,
      estimatedDurationSeconds: s.estimatedDurationSeconds,
    }));

    return {
      ok: true,
      data: {
        subtitles: data.subtitles,
        scenes: mappedScenes,
        projectId,
        projectTitle: data.projectTitle,
      },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function saveSubtitles(
  input: unknown,
): Promise<SubtitleActionResult<{ subtitles: SubtitleData }>> {
  try {
    const parsed = saveSubtitlesSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid subtitle data." };
    }

    const ownerId = await requireAuthenticatedUserId();
    const { projectId, enabled, cues, style } = parsed.data;

    const saved = await saveProjectSubtitles(projectId, ownerId, {
      enabled,
      cues,
      style,
    });

    revalidatePath(`/projects/${projectId}/subtitles`);
    return { ok: true, data: { subtitles: saved } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function autoGenerateSubtitles(
  projectId: string,
): Promise<SubtitleActionResult<{ subtitles: SubtitleData }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const generated = await regenerateProjectSubtitles(projectId, ownerId);

    revalidatePath(`/projects/${projectId}/subtitles`);
    return { ok: true, data: { subtitles: generated } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function exportSubtitles(
  projectId: string,
  format: "srt" | "vtt",
): Promise<SubtitleActionResult<{ content: string; filename: string; mimeType: string }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const { subtitles, projectTitle } = await getProjectSubtitles(projectId, ownerId);

    const safeTitle = projectTitle.toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "subtitles";
    const filename = `${safeTitle}.${format}`;
    const mimeType = format === "srt" ? "text/plain" : "text/vtt";
    const content = format === "srt" ? generateSrtContent(subtitles.cues) : generateVttContent(subtitles.cues);

    return {
      ok: true,
      data: {
        content,
        filename,
        mimeType,
      },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { toAppError } from "@/lib/errors/app-error";
import { resolveScriptStudioProvider } from "@/lib/ai/script-studio-providers";
import {
  buildScriptBrief,
  loadScriptRecord,
  requireOwnedProject,
  saveScriptRecord,
} from "@/lib/scripts/script-repository";
import { createScene, type ScriptDocument, type ScriptScene } from "@/lib/scripts/script-document";
import {
  generateScriptInputSchema,
  regenerateSceneInputSchema,
  saveScriptInputSchema,
  type ScriptDocumentInput,
} from "@/lib/validation/script";
import type { SceneDraft, ScriptDraft } from "@/lib/providers/contracts";

/**
 * SERVER ONLY Script Studio actions.
 *
 * Every action resolves the caller's user id from the server session, verifies
 * project ownership before touching data, and calls the AI provider from the
 * server. No provider credential is ever accepted from, or returned to, the
 * browser.
 */

export type StudioActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function firstIssue(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "The script could not be validated.";
}

function withSceneIds(draft: ScriptDraft, previous: ScriptScene[]): ScriptScene[] {
  return draft.scenes.map((scene, index) =>
    createScene({
      ...scene,
      id: previous[index]?.id ?? createScene().id,
    }),
  );
}

function toSceneDraft(scene: ScriptScene): SceneDraft {
  return {
    title: scene.title,
    narration: scene.narration,
    visualDirection: scene.visualDirection,
    estimatedDurationSeconds: scene.estimatedDurationSeconds,
  };
}

export async function saveScriptDocument(input: unknown): Promise<StudioActionResult<{ document: ScriptDocument; version: number }>> {
  try {
    const parsed = saveScriptInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const ownerId = await requireAuthenticatedUserId();
    const document: ScriptDocumentInput = parsed.data.document;
    const record = await saveScriptRecord(parsed.data.projectId, ownerId, {
      title: document.title,
      hook: document.hook,
      scenes: document.scenes.map((scene) => ({ ...scene })),
    });

    revalidatePath(`/projects/${parsed.data.projectId}/script`);
    return { ok: true, data: { document: record.document, version: record.version } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function generateScriptDocument(input: unknown): Promise<StudioActionResult<{ document: ScriptDocument; version: number; mode: "live" | "demo" }>> {
  try {
    const parsed = generateScriptInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const ownerId = await requireAuthenticatedUserId();
    const project = await requireOwnedProject(parsed.data.projectId, ownerId);
    const brief = await buildScriptBrief(project);
    const provider = resolveScriptStudioProvider();

    const current = await loadScriptRecord(project.id, ownerId);
    const previousDocument: ScriptDraft | null = current.document.scenes.length
      ? {
          title: current.document.title,
          hook: current.document.hook,
          scenes: current.document.scenes.map(toSceneDraft),
        }
      : null;

    const sceneCount = parsed.data.sceneCount ?? Math.max(3, current.document.scenes.length);
    const result = await provider.generateDocument(brief, { sceneCount, previousDocument });

    const document: ScriptDocument = {
      title: result.data.title || project.title,
      hook: result.data.hook,
      scenes: withSceneIds(result.data, current.document.scenes),
    };
    const record = await saveScriptRecord(project.id, ownerId, document);

    revalidatePath(`/projects/${project.id}/script`);
    return { ok: true, data: { document: record.document, version: record.version, mode: result.mode } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function regenerateScriptScene(input: unknown): Promise<StudioActionResult<{ scene: ScriptScene; mode: "live" | "demo" }>> {
  try {
    const parsed = regenerateSceneInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const ownerId = await requireAuthenticatedUserId();
    const project = await requireOwnedProject(parsed.data.projectId, ownerId);
    const brief = await buildScriptBrief(project);
    const provider = resolveScriptStudioProvider();

    const current = await loadScriptRecord(project.id, ownerId);
    const index = current.document.scenes.findIndex((scene) => scene.id === parsed.data.scene.id);
    if (index === -1) {
      return { ok: false, error: "That scene is no longer part of this script. Save your changes and try again." };
    }

    const scenes = current.document.scenes;
    const result = await provider.regenerateScene(brief, {
      sceneNumber: index + 1,
      sceneCount: scenes.length,
      scene: parsed.data.scene,
      neighbours: {
        previous: index > 0 ? toSceneDraft(scenes[index - 1]) : null,
        next: index < scenes.length - 1 ? toSceneDraft(scenes[index + 1]) : null,
      },
      direction: parsed.data.direction,
    });

    const scene: ScriptScene = { id: parsed.data.scene.id, ...result.data };
    const document: ScriptDocument = {
      ...current.document,
      scenes: scenes.map((item, position) => (position === index ? scene : item)),
    };
    await saveScriptRecord(project.id, ownerId, document);

    revalidatePath(`/projects/${project.id}/script`);
    return { ok: true, data: { scene, mode: result.mode } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

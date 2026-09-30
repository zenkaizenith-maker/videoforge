"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { toAppError } from "@/lib/errors/app-error";
import {
  buildScriptBrief,
  loadScriptRecord,
  requireOwnedProject,
  saveScriptRecord,
} from "@/lib/scripts/script-repository";
import {
  createScene,
  estimateNarrationSeconds,
  type ScriptDocument,
  type ScriptScene,
} from "@/lib/scripts/script-document";
import { getScriptProviderConfigStatus } from "@/config/script-provider-env";
import { resolveScriptStudioProvider } from "@/lib/ai/script-studio-providers";
import {
  saveScriptInputSchema,
  type ScriptDocumentInput,
} from "@/lib/validation/script";
import type { SceneDraft, ScriptBrief } from "@/lib/providers/contracts";

export type SceneActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function firstIssue(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "The scene could not be validated.";
}

function toSceneDraft(scene: ScriptScene): SceneDraft {
  return {
    title: scene.title,
    narration: scene.narration,
    visualDirection: scene.visualDirection,
    estimatedDurationSeconds: scene.estimatedDurationSeconds,
  };
}

export async function loadScenesDocument(
  projectId: string,
): Promise<SceneActionResult<{ document: ScriptDocument; version: number }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const record = await loadScriptRecord(projectId, ownerId);
    return { ok: true, data: { document: record.document, version: record.version } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function saveScenesDocument(
  input: unknown,
): Promise<SceneActionResult<{ document: ScriptDocument; version: number }>> {
  try {
    const parsed = saveScriptInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const ownerId = await requireAuthenticatedUserId();
    const documentInput: ScriptDocumentInput = parsed.data.document;
    const record = await saveScriptRecord(parsed.data.projectId, ownerId, {
      title: documentInput.title,
      hook: documentInput.hook,
      scenes: documentInput.scenes.map((scene) => ({ ...scene })),
    });

    revalidatePath(`/projects/${parsed.data.projectId}/scenes`);
    revalidatePath(`/projects/${parsed.data.projectId}/script`);
    return { ok: true, data: { document: record.document, version: record.version } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function addScene(
  projectId: string,
): Promise<SceneActionResult<{ scene: ScriptScene }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const record = await loadScriptRecord(projectId, ownerId);
    const scene = createScene({ estimatedDurationSeconds: 15 });
    const document: ScriptDocument = {
      ...record.document,
      scenes: [...record.document.scenes, scene],
    };
    await saveScriptRecord(projectId, ownerId, document);

    revalidatePath(`/projects/${projectId}/scenes`);
    revalidatePath(`/projects/${projectId}/script`);
    return { ok: true, data: { scene } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function duplicateScene(
  projectId: string,
  sceneId: string,
): Promise<SceneActionResult<{ scene: ScriptScene }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const record = await loadScriptRecord(projectId, ownerId);
    const index = record.document.scenes.findIndex((scene) => scene.id === sceneId);
    if (index === -1) {
      return { ok: false, error: "That scene is no longer part of this script." };
    }

    const original = record.document.scenes[index];
    const duplicate = createScene({
      ...original,
      title: `${original.title} (copy)`,
    });
    const scenes = [...record.document.scenes];
    scenes.splice(index + 1, 0, duplicate);
    const document: ScriptDocument = { ...record.document, scenes };
    await saveScriptRecord(projectId, ownerId, document);

    revalidatePath(`/projects/${projectId}/scenes`);
    revalidatePath(`/projects/${projectId}/script`);
    return { ok: true, data: { scene: duplicate } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function deleteScene(
  projectId: string,
  sceneId: string,
): Promise<SceneActionResult<{ document: ScriptDocument }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const record = await loadScriptRecord(projectId, ownerId);
    const scenes = record.document.scenes.filter((scene) => scene.id !== sceneId);
    if (!scenes.length) {
      return { ok: false, error: "A script must contain at least one scene." };
    }

    const document: ScriptDocument = { ...record.document, scenes };
    const saved = await saveScriptRecord(projectId, ownerId, document);

    revalidatePath(`/projects/${projectId}/scenes`);
    revalidatePath(`/projects/${projectId}/script`);
    return { ok: true, data: { document: saved.document } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function moveScene(
  projectId: string,
  sceneId: string,
  direction: -1 | 1,
): Promise<SceneActionResult<{ document: ScriptDocument }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const record = await loadScriptRecord(projectId, ownerId);
    const index = record.document.scenes.findIndex((scene) => scene.id === sceneId);
    if (index === -1) {
      return { ok: false, error: "That scene is no longer part of this script." };
    }

    const target = index + direction;
    if (target < 0 || target >= record.document.scenes.length) {
      return { ok: true, data: { document: record.document } };
    }

    const scenes = [...record.document.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    const document: ScriptDocument = { ...record.document, scenes };
    const saved = await saveScriptRecord(projectId, ownerId, document);

    revalidatePath(`/projects/${projectId}/scenes`);
    revalidatePath(`/projects/${projectId}/script`);
    return { ok: true, data: { document: saved.document } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function regenerateScene(
  projectId: string,
  scene: ScriptScene,
  direction?: string,
): Promise<SceneActionResult<{ scene: ScriptScene; mode: "live" | "demo" }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const project = await requireOwnedProject(projectId, ownerId);
    const brief = await buildScriptBrief(project);
    const provider = resolveScriptStudioProvider();

    const status = getScriptProviderConfigStatus();
    const mode: "live" | "demo" = status.mode === "demo" ? "demo" : provider.mode;

    const current = await loadScriptRecord(projectId, ownerId);
    const index = current.document.scenes.findIndex((s) => s.id === scene.id);
    if (index === -1) {
      return { ok: false, error: "That scene is no longer part of this script. Save your changes and try again." };
    }

    const scenes = current.document.scenes;
    const result = await provider.regenerateScene(brief, {
      sceneNumber: index + 1,
      sceneCount: scenes.length,
      scene: {
        title: scene.title,
        narration: scene.narration,
        visualDirection: scene.visualDirection,
        estimatedDurationSeconds: scene.estimatedDurationSeconds,
      },
      neighbours: {
        previous: index > 0 ? toSceneDraft(scenes[index - 1]) : null,
        next: index < scenes.length - 1 ? toSceneDraft(scenes[index + 1]) : null,
      },
      direction: direction || undefined,
    });

    const nextScene: ScriptScene = { id: scene.id, ...result.data };
    const document: ScriptDocument = {
      ...current.document,
      scenes: scenes.map((item, position) => (position === index ? nextScene : item)),
    };
    await saveScriptRecord(projectId, ownerId, document);

    revalidatePath(`/projects/${projectId}/scenes`);
    revalidatePath(`/projects/${projectId}/script`);
    return { ok: true, data: { scene: nextScene, mode } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

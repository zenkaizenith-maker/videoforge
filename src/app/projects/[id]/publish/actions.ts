"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { toAppError } from "@/lib/errors/app-error";
import {
  getPublishStudioData,
  savePublishMetadata,
} from "@/lib/publish/publish-repository";
import { generatePublishMetadata } from "@/lib/publish/generator";
import { loadScriptRecord } from "@/lib/scripts/script-repository";
import type { PublishMetadata, PublishStudioData } from "@/lib/publish/types";

export type PublishActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadPublishData(
  projectId: string,
): Promise<PublishActionResult<PublishStudioData>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const data = await getPublishStudioData(projectId, ownerId);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function updateMetadata(params: {
  projectId: string;
  metadata: PublishMetadata;
}): Promise<PublishActionResult<{ metadata: PublishMetadata }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const saved = await savePublishMetadata({
      projectId: params.projectId,
      ownerId,
      metadata: params.metadata,
      markPublished: false,
    });

    revalidatePath(`/projects/${params.projectId}/publish`);
    return { ok: true, data: { metadata: saved } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function publishProject(
  projectId: string,
  metadata: PublishMetadata,
): Promise<PublishActionResult<{ metadata: PublishMetadata }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const saved = await savePublishMetadata({
      projectId,
      ownerId,
      metadata,
      markPublished: true,
    });

    revalidatePath(`/projects/${projectId}/publish`);
    revalidatePath(`/dashboard`);
    return { ok: true, data: { metadata: saved } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function autoGenerateMetadata(
  projectId: string,
): Promise<PublishActionResult<{ metadata: PublishMetadata }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const scriptRecord = await loadScriptRecord(projectId, ownerId);

    const generated = generatePublishMetadata(
      scriptRecord.document.title,
      scriptRecord.document.hook,
      scriptRecord.document.scenes,
    );

    const saved = await savePublishMetadata({
      projectId,
      ownerId,
      metadata: generated,
      markPublished: false,
    });

    revalidatePath(`/projects/${projectId}/publish`);
    return { ok: true, data: { metadata: saved } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

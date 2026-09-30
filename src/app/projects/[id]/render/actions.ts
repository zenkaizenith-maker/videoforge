"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUserId } from "@/lib/auth/guards";
import { toAppError } from "@/lib/errors/app-error";
import {
  cancelRenderJobRecord,
  createRenderJobRecord,
  getRenderStudioData,
} from "@/lib/render/render-repository";
import { loadScriptRecord } from "@/lib/scripts/script-repository";
import { getWorkerClient } from "@/lib/jobs/worker-client";
import { createAssetSignedUrl } from "@/lib/storage/supabase-storage-client";
import type {
  RenderJobRecord,
  RenderPreflight,
} from "@/lib/render/types";

export type RenderActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadRenderData(projectId: string): Promise<
  RenderActionResult<{
    preflight: RenderPreflight;
    activeJob: RenderJobRecord | null;
    recentJobs: RenderJobRecord[];
    projectId: string;
    projectTitle: string;
  }>
> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const data = await getRenderStudioData(projectId, ownerId);

    return {
      ok: true,
      data: {
        ...data,
        projectId,
      },
    };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function startRender(
  projectId: string,
): Promise<RenderActionResult<{ job: RenderJobRecord }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const job = await createRenderJobRecord(projectId, ownerId);

    // Enqueue the real video rendering with worker client
    const workerClient = getWorkerClient();
    await workerClient.enqueueRender({
      projectId,
      renderJobId: job.id,
      callbackUrl: "",
    });

    revalidatePath(`/projects/${projectId}/render`);
    return { ok: true, data: { job } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function checkRenderJobStatus(
  projectId: string,
  jobId: string,
): Promise<RenderActionResult<{ job: RenderJobRecord | null }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const scriptRecord = await loadScriptRecord(projectId, ownerId);

    const jobs = scriptRecord.document.renderJobs || [];
    let job = jobs.find((j) => j.id === jobId) || null;

    // If completed and signed URL needs refresh
    if (job && job.status === "completed" && !job.outputVideoUrl) {
      try {
        const freshUrl = await createAssetSignedUrl(`${projectId}/renders/${jobId}.mp4`, 86400);
        job = { ...job, outputVideoUrl: freshUrl };
      } catch {
        // Keep existing URL
      }
    }

    return { ok: true, data: { job } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function cancelRender(
  projectId: string,
  jobId: string,
): Promise<RenderActionResult<{ cancelled: true }>> {
  try {
    const ownerId = await requireAuthenticatedUserId();
    const worker = getWorkerClient();
    await worker.cancel(jobId);
    await cancelRenderJobRecord(projectId, ownerId, jobId);

    revalidatePath(`/projects/${projectId}/render`);
    return { ok: true, data: { cancelled: true } };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

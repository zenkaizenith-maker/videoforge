import type { RenderRequest } from "@/types/domain";
import {
  cancelActiveRenderJob,
  executeRenderPipeline,
} from "@/lib/video/ffmpeg-renderer";

export interface WorkerClient {
  enqueueRender(request: RenderRequest): Promise<{ accepted: true }>;
  cancel(jobId: string): Promise<void>;
}

/**
 * Local asynchronous worker client that runs FFmpeg rendering in the background.
 * It immediately accepts the render request without blocking Next.js server actions.
 */
export class LocalWorkerClient implements WorkerClient {
  async enqueueRender(request: RenderRequest): Promise<{ accepted: true }> {
    // Dispatch background execution asynchronously
    queueMicrotask(() => {
      void executeRenderPipeline(request.projectId, request.renderJobId).catch((err) => {
        console.error(`[WorkerClient] Job ${request.renderJobId} background failure:`, err);
      });
    });

    return { accepted: true };
  }

  async cancel(jobId: string): Promise<void> {
    cancelActiveRenderJob(jobId);
  }
}

/**
 * HTTP worker client for independent remote rendering worker services.
 */
export class HttpWorkerClient implements WorkerClient {
  constructor(private baseUrl: string) {}

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const secret = process.env.WORKER_SHARED_SECRET;
    if (secret && secret.trim().length > 0) {
      headers["Authorization"] = `Bearer ${secret.trim()}`;
    }
    return headers;
  }

  async enqueueRender(request: RenderRequest): Promise<{ accepted: true }> {
    const res = await fetch(`${this.baseUrl}/api/render`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Remote render worker rejected job: ${errText}`);
    }

    return { accepted: true };
  }

  async cancel(jobId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/render/${jobId}/cancel`, {
      method: "POST",
      headers: this.getHeaders(),
    }).catch((err) => {
      console.warn(`[WorkerClient] Could not notify remote worker of cancel:`, err);
    });
  }
}

/**
 * Returns the appropriate worker client based on environment configuration.
 */
export function getWorkerClient(): WorkerClient {
  const workerUrl = process.env.WORKER_BASE_URL;
  if (workerUrl && workerUrl.trim().length > 0) {
    return new HttpWorkerClient(workerUrl.trim());
  }
  return new LocalWorkerClient();
}

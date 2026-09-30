import http, { IncomingMessage, ServerResponse } from "http";
import fs from "fs";
import path from "path";
import { executeRenderPipeline, cancelActiveRenderJob } from "@/lib/video/ffmpeg-renderer";
import {
  getRenderJobRecordServiceRole,
  cancelRenderJobRecordServiceRole,
} from "@/lib/render/render-repository";
import type { RenderRequest } from "@/types/domain";

// Load .env.local if running standalone outside of Next.js
function loadLocalEnv() {
  const envFiles = [".env.local", ".env"];
  for (const envFile of envFiles) {
    const fullPath = path.resolve(process.cwd(), envFile);
    if (!fs.existsSync(fullPath)) continue;
    const content = fs.readFileSync(fullPath, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}
loadLocalEnv();

const PORT = parseInt(process.env.PORT || process.env.WORKER_PORT || "4100", 10);
const SHARED_SECRET = process.env.WORKER_SHARED_SECRET || "";

function sendJson(res: ServerResponse, statusCode: number, data: unknown) {
  const json = JSON.stringify(data);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("Request payload too large"));
      }
    });
    req.on("end", () => {
      try {
        if (!body) {
          resolve({} as T);
          return;
        }
        resolve(JSON.parse(body) as T);
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function authenticate(req: IncomingMessage, res: ServerResponse): boolean {
  if (!SHARED_SECRET) {
    // If no shared secret is configured, allow in development but warn
    return true;
  }

  const authHeader = req.headers["authorization"] || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token || token !== SHARED_SECRET) {
    sendJson(res, 401, { error: "Unauthorized: Invalid or missing bearer token" });
    return false;
  }

  return true;
}

const server = http.createServer(async (req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // Liveness / health endpoint
  if (method === "GET" && pathname === "/health") {
    sendJson(res, 200, { status: "ok", service: "videoforge-render-worker", timestamp: new Date().toISOString() });
    return;
  }

  // All /api/render routes require authentication
  if (pathname.startsWith("/api/render")) {
    if (!authenticate(req, res)) {
      return;
    }
  }

  try {
    // 1. Submit render job: POST /api/render
    if (method === "POST" && pathname === "/api/render") {
      const body = await parseJsonBody<RenderRequest>(req);
      const { projectId, renderJobId } = body;

      if (!projectId || !renderJobId) {
        sendJson(res, 400, { error: "Missing required fields: projectId and renderJobId" });
        return;
      }

      // Immediately respond accepted conforming to HttpWorkerClient contract
      sendJson(res, 202, { accepted: true, jobId: renderJobId });

      // Run background render execution asynchronously
      queueMicrotask(() => {
        void executeRenderPipeline(projectId, renderJobId).catch((err) => {
          console.error(`[WorkerServer] Background render error for job ${renderJobId}:`, err);
        });
      });
      return;
    }

    // 2. Check render job status: GET /api/render/:jobId
    const statusMatch = pathname.match(/^\/api\/render\/([a-zA-Z0-9_-]+)$/);
    if (method === "GET" && statusMatch) {
      const jobId = statusMatch[1];
      const projectId = url.searchParams.get("projectId");

      if (!projectId) {
        sendJson(res, 400, { error: "Missing query parameter: projectId" });
        return;
      }

      const job = await getRenderJobRecordServiceRole(projectId, jobId);
      if (!job) {
        sendJson(res, 404, { error: `Render job ${jobId} not found` });
        return;
      }

      sendJson(res, 200, { job });
      return;
    }

    // 3. Cancel render job: POST /api/render/:jobId/cancel
    const cancelMatch = pathname.match(/^\/api\/render\/([a-zA-Z0-9_-]+)\/cancel$/);
    if (method === "POST" && cancelMatch) {
      const jobId = cancelMatch[1];
      const body = await parseJsonBody<Record<string, string | undefined>>(req).catch(
        (): Record<string, string | undefined> => ({}),
      );
      const projectId = body.projectId || url.searchParams.get("projectId") || "";

      // 1. Cancel running in-memory process if local to this worker
      cancelActiveRenderJob(jobId);

      // 2. If projectId provided, update the Supabase job state
      if (projectId) {
        await cancelRenderJobRecordServiceRole(projectId, jobId).catch((err) => {
          console.warn(`[WorkerServer] Could not update cancelled record in Supabase:`, err);
        });
      }

      sendJson(res, 200, { cancelled: true, jobId });
      return;
    }

    sendJson(res, 404, { error: "Endpoint not found" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[WorkerServer] Unhandled request error:", error);
    sendJson(res, 500, { error: message });
  }
});

const HOST = process.env.HOST || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`[WorkerServer] VideoForge render worker running on ${HOST}:${PORT}`);
  console.log(`[WorkerServer] Health check: http://${HOST}:${PORT}/health`);
  console.log(`[WorkerServer] Render endpoint: http://${HOST}:${PORT}/api/render`);
});

export { server };

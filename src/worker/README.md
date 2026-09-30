# VideoForge Standalone Render Worker

The VideoForge Render Worker is an independent, lightweight HTTP microservice responsible for orchestrating and executing FFmpeg video rendering outside of serverless function constraints (e.g. Vercel's 50 MB bundle limit and execution timeouts).

---

## Architecture & Integration

- **Protocol**: HTTP REST.
- **Client**: Handled automatically by `HttpWorkerClient` in `src/lib/jobs/worker-client.ts` when `WORKER_BASE_URL` is set on the Next.js app.
- **Authentication**: Validates `Authorization: Bearer <WORKER_SHARED_SECRET>` on all `/api/render/*` endpoints.
- **Rendering Engine**: Directly invokes `executeRenderPipeline(projectId, renderJobId)` using `ffmpeg-static` / system `ffmpeg`.
- **Database / Storage**: Communicates directly with Supabase via `@/lib/supabase/server-service-role` using `SUPABASE_SECRET_KEY` to download assets, upload rendered MP4 masters to the `project-assets` bucket, and update job progress in real-time.

---

## API Endpoints

| Method | Path | Auth Required | Description |
|---|---|---|---|
| `GET` | `/health` | No | Liveness probe / status check |
| `POST` | `/api/render` | Yes (`Bearer <token>`) | Enqueues a render job `{ projectId, renderJobId }` and starts background processing |
| `GET` | `/api/render/:jobId?projectId=...` | Yes (`Bearer <token>`) | Returns status and metadata of the specified render job |
| `POST` | `/api/render/:jobId/cancel` | Yes (`Bearer <token>`) | Cancels the active FFmpeg process and marks the job record cancelled |

---

## Required Environment Variables

When deploying or running the worker, provide the following environment variables:

```bash
# Server port (default: 4100)
PORT=4100

# Shared secret (must match WORKER_SHARED_SECRET in the Next.js .env)
WORKER_SHARED_SECRET=your-secure-shared-secret

# Supabase connectivity (Required to fetch scripts, download assets, and upload MP4)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-supabase-service-role-key
```

---

## Running Locally

1. Ensure dependencies are installed:
   ```bash
   npm install
   ```

2. Start the worker:
   ```bash
   npm run worker
   ```

3. Configure the Next.js application in `.env.local` to direct renders to the worker:
   ```bash
   WORKER_BASE_URL=http://localhost:4100
   WORKER_SHARED_SECRET=your-secure-shared-secret
   ```

4. Verify health check:
   ```bash
   curl http://localhost:4100/health
   ```

---

## Deploying to Render (Free Web Service)

The worker is pre-configured to run as a Docker Web Service on Render using the included `Dockerfile` and `render.yaml`.

### Option A: Blueprints (Recommended)
1. In the [Render Dashboard](https://dashboard.render.com), click **New +** -> **Blueprint**.
2. Connect your GitHub/GitLab repository containing this project.
3. Render will detect `render.yaml` and configure the web service automatically.
4. Set the secret environment variables when prompted:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
   - `WORKER_SHARED_SECRET`

### Option B: Manual Web Service Setup
1. In the [Render Dashboard](https://dashboard.render.com), click **New +** -> **Web Service**.
2. Connect the repository.
3. Select **Docker** environment (or let Render auto-detect `Dockerfile`).
4. Set Instance Type to **Free**.
5. Set Health Check Path to `/health`.
6. Add the following Environment Variables in Render:
   - `HOST`: `0.0.0.0`
   - `PORT`: `4100` (or leave default, Render automatically assigns `PORT`)
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://your-project.supabase.co`
   - `SUPABASE_SECRET_KEY`: `your-supabase-service-role-key`
   - `WORKER_SHARED_SECRET`: `your-secure-shared-secret`
7. Click **Create Web Service**.

### Connecting to VideoForge on Vercel
Once deployed, copy the service URL (e.g. `https://videoforge-render-worker.onrender.com`) and configure it in your Vercel deployment's Environment Variables:
- `WORKER_BASE_URL`: `https://videoforge-render-worker.onrender.com`
- `WORKER_SHARED_SECRET`: `your-secure-shared-secret`

---

## Render Free Tier Considerations

- **Cold Starts**: Render free instances spin down after 15 minutes of inactivity. When a new render request arrives after idling, the first request may experience a ~50-second wake-up delay before responding.
- **Resource Limits**: The free tier provides 512 MB RAM and 0.1 CPU core. The worker is optimized for 720p/1080p single-job encoding. For high-volume or concurrent rendering, scale CPU/RAM accordingly.


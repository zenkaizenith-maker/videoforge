# VideoForge architecture — Phase 1

## Boundaries

`Browser → Next.js routes/actions → Supabase → job record → independent worker → private storage → browser / YouTube`

The web application creates validated intent and displays status. It does not render media. A separately deployed worker owns long-running provider calls, FFmpeg execution, temporary media, retries, and progress updates. This keeps the application portable between local Windows development and a future worker host.

## Folder map

- `src/app` — thin route-level UI and route reservation.
- `src/components` — shared visual components.
- `src/lib/providers` — provider contracts and clearly labelled demo implementations.
- `src/lib/jobs` — worker-facing contract, never FFmpeg itself.
- `src/lib/supabase` — browser/server session clients and token refresh proxy.
- `src/lib/validation` — server-side input contracts.
- `src/types` — shared domain types.

## Provider policy

Every capability is selected through a narrow interface. UI and domain code receive a provider result, not a vendor SDK response. `DemoScriptProvider` is intentionally local and returns `mode: "demo"`; it must not be presented to users as generated AI content.

## Request lifecycle

1. A protected server action validates input and confirms project ownership.
2. It writes a job with status `queued`.
3. The worker claims the job and advances `processing → completed | failed | cancelled`.
4. The worker stores only stable output metadata in the database; temporary files stay with the worker.
5. The browser subscribes or polls for job status and requests signed URLs only after authorization.

## Deployment posture

- Next.js: Vercel-compatible, short requests only.
- Supabase: Auth, PostgreSQL, private object storage, RLS.
- Worker: local process in development; a container/service in production.
- Secrets: browser receives only `NEXT_PUBLIC_SUPABASE_*`; worker credentials, provider keys, and OAuth refresh tokens remain server-only.

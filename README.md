# VideoForge — foundation

VideoForge is an original, free-first AI video production workspace. The foundation supplies a polished Next.js shell, the primary navigation routes, a Supabase session-client boundary, domain contracts, server-side validation, an independent-worker boundary, and reusable application layers. It intentionally does **not** claim to generate video, sign users in, render FFmpeg jobs, or publish to YouTube yet.

## Run locally

1. In `videoforge`, install the pinned packages with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase URL and publishable key when a project is available. The visual demo can be viewed before that connection is made.
4. Run `npm run dev`, then open `http://localhost:3000`.
5. Run `npm run lint`, `npm run typecheck`, and `npm run build` before committing changes.

## Project structure

The application uses the conventional `src/` layout, so `/app` means `src/app`.

- `src/app` — routes and route-level composition.
- `src/components/ui` — small accessible, reusable primitives.
- `src/components/layout`, `project`, `video`, `dashboard` — feature-level view components.
- `src/config` — centralized, validated runtime configuration.
- `src/lib/ai`, `db`, `storage`, `jobs`, `auth`, `video` — provider-neutral application boundaries.
- `src/lib/errors` and `src/lib/utils` — shared error and utility functions.
- `src/types` — shared domain and database placeholder types.
- `src/hooks` — reusable client-side hooks.
- `public` — static assets; currently kept intentionally empty.

## Environment variables

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL; safe for browser use.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase publishable key; safe for browser use.
- `WORKER_BASE_URL` — future worker endpoint; server-only.
- `WORKER_SHARED_SECRET` — authenticates the application to its worker; server-only.
- `SCRIPT_PROVIDER_MODE` — `live` (default) or `demo`. Server-only.
- `SCRIPT_PROVIDER_API_KEY` — Script Studio provider credential. Server-only.
- `SCRIPT_PROVIDER_BASE_URL` — OpenAI-compatible base URL. Server-only.
- `SCRIPT_PROVIDER_MODEL` — chat model the endpoint serves. Server-only.
- `SCRIPT_PROVIDER_TIMEOUT_MS` — optional provider timeout, 5000–300000. Server-only.

Never add a service-role key, AI-provider key, or YouTube refresh token to a `NEXT_PUBLIC_` variable.

## Script Studio provider

`/projects/[id]/script` calls its provider from a server action. With
`SCRIPT_PROVIDER_MODE` unset or `live`, the studio uses
`OpenAiScriptStudioProvider` against `SCRIPT_PROVIDER_BASE_URL` and requires
`SCRIPT_PROVIDER_API_KEY`; a missing key is reported as a configuration error
rather than silently downgrading to placeholder copy. `SCRIPT_PROVIDER_MODE=demo`
opts into `DemoScriptStudioProvider`, which never makes a network call and is
labelled as such in the interface.

Credentials are read only by `src/config/script-provider-env.ts` and
`src/lib/providers/openai-script-studio-provider.ts`, both server-only modules.
Every provider error is scrubbed of the key before it is surfaced.

To verify the wiring without printing a secret, run
`node scripts/check-script-provider.mjs`. It reports provider mode, base URL,
model, and a single live round trip, and never prints the key.

## Next phase

1. Connect a Supabase project and add a generated, RLS-reviewed migration.
2. Implement email/password sign-up and verified route protection using `getClaims()`.
3. Add persisted project creation through a server action.
4. Start the local worker with one labelled demo job type before introducing a live provider.

## Current limitations

The dashboard uses explicit sample data. Login/sign-up controls are disabled. Project stage routes are intentional placeholders, and the worker client throws a clear configuration error until an actual worker is supplied.

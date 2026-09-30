# Initial data model plan

The database is deliberately deferred until a Supabase project is connected. The first migration should create these tables with UUID primary keys, timestamps, foreign keys, and RLS enabled on every public table.

| Table | Purpose | Ownership boundary |
| --- | --- | --- |
| `profiles` | User-facing preferences | `id = auth.users.id` |
| `projects` | Project identity, topic, state | `owner_id = auth.uid()` |
| `project_settings` | Format, pacing, creative settings | inherited through project |
| `scripts` | Versioned script content | inherited through project |
| `scenes` | Ordered scene plan | inherited through project |
| `assets` | Visual/audio source metadata | inherited through project |
| `audio_tracks` / `subtitle_tracks` | Generated or uploaded tracks | inherited through project |
| `render_jobs` | Queued long-running work | inherited through project |
| `render_outputs` / `thumbnails` | Finished private media references | inherited through project |
| `metadata` | Titles, descriptions, tags | inherited through project |
| `youtube_connections` / `publish_jobs` | Encrypted OAuth connection and publish work | `user_id = auth.uid()` |
| `provider_configs` / `usage_records` | Server-managed provider and quota audit data | user or administrator only |

Policies must use ownership predicates, not merely `TO authenticated`. A project update policy needs both `USING` and `WITH CHECK` clauses so a user cannot reassign its owner. Worker/service access uses a server-only secret and is not exposed to the browser.

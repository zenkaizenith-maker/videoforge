-- Migration: 20260930120000_create_assets_table.sql
-- Description: Create public.assets table with RLS policies and schema cache notification
-- VideoForge Architecture:
-- 1. Script scenes are stored inside scripts.content JSON.
-- 2. ScriptScene.id is a string identifier, so assigned_scene_id is typed as TEXT.
-- 3. No foreign key to a public.scenes table.
-- 4. RLS policies ensure project-level data isolation via projects.owner_id = auth.uid().

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  original_filename text not null,
  storage_path text not null,
  media_type text not null,
  mime_type text not null,
  file_size bigint not null,
  width int,
  height int,
  duration_seconds int,
  assigned_scene_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for performance and uniqueness
create index if not exists assets_project_id_idx on public.assets(project_id);
create unique index if not exists assets_project_storage_path_idx on public.assets(project_id, storage_path);

-- Enable Row Level Security
alter table public.assets enable row level security;

-- RLS Policies
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'assets' and policyname = 'Users can view their own project assets.'
  ) then
    create policy "Users can view their own project assets."
      on public.assets for select
      to authenticated
      using (
        exists (
          select 1 from public.projects
          where projects.id = assets.project_id
            and projects.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'assets' and policyname = 'Users can insert assets into their own projects.'
  ) then
    create policy "Users can insert assets into their own projects."
      on public.assets for insert
      to authenticated
      with check (
        exists (
          select 1 from public.projects
          where projects.id = assets.project_id
            and projects.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'assets' and policyname = 'Users can update assets in their own projects.'
  ) then
    create policy "Users can update assets in their own projects."
      on public.assets for update
      to authenticated
      using (
        exists (
          select 1 from public.projects
          where projects.id = assets.project_id
            and projects.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'assets' and policyname = 'Users can delete assets from their own projects.'
  ) then
    create policy "Users can delete assets from their own projects."
      on public.assets for delete
      to authenticated
      using (
        exists (
          select 1 from public.projects
          where projects.id = assets.project_id
            and projects.owner_id = auth.uid()
        )
      );
  end if;
end
$$;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/server-service-role";
import { AppError } from "@/lib/errors/app-error";
import {
  parseScriptDocument,
  serializeScriptDocument,
  type ScriptDocument,
  type StoredScriptRecord,
} from "@/lib/scripts/script-document";
import type { ScriptBrief } from "@/lib/providers/contracts";

/**
 * SERVER ONLY database boundary for the Script Studio.
 *
 * It reads and writes the existing `scripts` table only. No table is created,
 * altered, or dropped, and every read and write is scoped to the caller's own
 * project id so a caller cannot reach another owner's script.
 */

interface OwnedProjectRow {
  id: string;
  title: string;
  topic: string | null;
  owner_id: string;
}

interface ProjectSettingsRow {
  aspect_ratio: string | null;
  target_duration_seconds: number | null;
  voice_style: string | null;
  visual_style: string | null;
}

export interface OwnedProject {
  id: string;
  title: string;
  topic: string | null;
}

const SCRIPT_COLUMNS = "id,project_id,content,version,updated_at";
const SCRIPT_COLUMNS_FALLBACK = "id,project_id,content,version";

function parseTopicDetails(topic: string | null) {
  if (!topic) return { topic: null, audience: "General Public", videoType: "Explainer / Video Essay" };
  const marker = topic.indexOf("[Format:");
  if (marker === -1) return { topic: topic.trim() || null, audience: "General Public", videoType: "Explainer / Video Essay" };
  const core = topic.slice(0, marker).trim() || null;
  const detail = topic.slice(marker + 1).replace(/\]$/, "");
  const formatMatch = detail.match(/Format:\s*([^|]+)/);
  const audienceMatch = detail.match(/Audience:\s*(.+)$/);
  return {
    topic: core,
    videoType: formatMatch ? formatMatch[1].trim() : "Explainer / Video Essay",
    audience: audienceMatch ? audienceMatch[1].trim() : "General Public",
  };
}

/** Confirms the signed-in user owns the project. Throws otherwise. */
export async function requireOwnedProject(projectId: string, ownerId: string): Promise<OwnedProject> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id,title,topic,owner_id")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    throw new AppError("The project could not be loaded.", "PROJECT_READ_FAILED", 500, error);
  }
  if (!data) {
    throw new AppError("You do not have access to that project.", "PROJECT_NOT_OWNED", 403);
  }
  const row = data as OwnedProjectRow;
  return { id: row.id, title: row.title, topic: row.topic };
}

async function readSettings(projectId: string): Promise<ProjectSettingsRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_settings")
    .select("aspect_ratio,target_duration_seconds,voice_style,visual_style")
    .eq("project_id", projectId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as ProjectSettingsRow | null) ?? null;
}

export async function buildScriptBrief(project: OwnedProject): Promise<ScriptBrief> {
  const settings = await readSettings(project.id);
  const details = parseTopicDetails(project.topic);
  return {
    projectTitle: project.title,
    topic: details.topic,
    audience: details.audience,
    videoType: details.videoType,
    targetDurationSeconds: settings?.target_duration_seconds ?? 60,
    visualStyle: settings?.visual_style ?? "Editorial",
    voiceStyle: settings?.voice_style ?? "Warm Narrator",
    aspectRatio: settings?.aspect_ratio ?? "16:9",
  };
}

interface RawScriptRow {
  id?: string | null;
  project_id?: string | null;
  content?: string | null;
  version?: number | null;
  updated_at?: string | null;
}

export async function loadScriptRecord(projectId: string, ownerId: string): Promise<StoredScriptRecord> {
  const project = await requireOwnedProject(projectId, ownerId);
  const supabase = await createClient();

  let row: RawScriptRow | null = null;
  const primary = await supabase
    .from("scripts")
    .select(SCRIPT_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!primary.error) {
    row = primary.data as RawScriptRow | null;
  } else {
    const fallback = await supabase
      .from("scripts")
      .select(SCRIPT_COLUMNS_FALLBACK)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) {
      throw new AppError("The script could not be loaded.", "SCRIPT_READ_FAILED", 500, fallback.error);
    }
    row = fallback.data as RawScriptRow | null;
  }

  const { document, format } = parseScriptDocument(row?.content ?? null, project.title);
  return {
    id: row?.id ?? null,
    version: typeof row?.version === "number" ? row.version : 0,
    document: format === "videoforge.script-outline.legacy" ? { ...document, title: document.title || project.title } : document,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveScriptRecord(
  projectId: string,
  ownerId: string,
  document: ScriptDocument,
): Promise<StoredScriptRecord> {
  await requireOwnedProject(projectId, ownerId);
  const supabase = await createClient();
  const content = serializeScriptDocument(document);

  const existing = await supabase
    .from("scripts")
    .select("id,version")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new AppError("The script could not be read before saving.", "SCRIPT_READ_FAILED", 500, existing.error);
  }

  const current = (existing.data ?? null) as { id?: string | null; version?: number | null } | null;
  const nextVersion = (typeof current?.version === "number" ? current.version : 0) + 1;
  const now = new Date().toISOString();

  if (current?.id) {
    const { data, error } = await supabase
      .from("scripts")
      .update({ content, version: nextVersion, updated_at: now })
      .eq("id", current.id)
      .eq("project_id", projectId)
      .select("id,version,updated_at")
      .maybeSingle();
    if (error) {
      throw new AppError("The script could not be saved.", "SCRIPT_WRITE_FAILED", 500, error);
    }
    const saved = (data ?? null) as RawScriptRow | null;
    return { id: saved?.id ?? current.id, version: saved?.version ?? nextVersion, document, updatedAt: saved?.updated_at ?? now };
  }

  const { data, error } = await supabase
    .from("scripts")
    .insert({ project_id: projectId, content, version: nextVersion })
    .select("id,version")
    .maybeSingle();
  if (error) {
    throw new AppError("The script could not be saved.", "SCRIPT_WRITE_FAILED", 500, error);
  }
  const saved = (data ?? null) as RawScriptRow | null;
  return { id: saved?.id ?? null, version: saved?.version ?? nextVersion, document, updatedAt: now };
}

export async function loadScriptRecordServiceRole(projectId: string): Promise<StoredScriptRecord> {
  const supabase = createServiceRoleClient();

  const { data: project } = await supabase
    .from("projects")
    .select("title")
    .eq("id", projectId)
    .maybeSingle();

  const projectTitle = (project as { title: string } | null)?.title ?? "Untitled Project";

  let row: RawScriptRow | null = null;
  const primary = await supabase
    .from("scripts")
    .select(SCRIPT_COLUMNS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!primary.error && primary.data) {
    row = primary.data as RawScriptRow | null;
  } else {
    const fallback = await supabase
      .from("scripts")
      .select(SCRIPT_COLUMNS_FALLBACK)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = (fallback.data ?? null) as RawScriptRow | null;
  }

  const { document, format } = parseScriptDocument(row?.content ?? null, projectTitle);
  return {
    id: row?.id ?? null,
    version: typeof row?.version === "number" ? row.version : 0,
    document: format === "videoforge.script-outline.legacy" ? { ...document, title: document.title || projectTitle } : document,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function saveScriptRecordServiceRole(
  projectId: string,
  document: ScriptDocument,
): Promise<StoredScriptRecord> {
  const supabase = createServiceRoleClient();
  const content = serializeScriptDocument(document);

  const existing = await supabase
    .from("scripts")
    .select("id,version")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = (existing.data ?? null) as { id?: string | null; version?: number | null } | null;
  const nextVersion = (typeof current?.version === "number" ? current.version : 0) + 1;
  const now = new Date().toISOString();

  if (current?.id) {
    const { data, error } = await supabase
      .from("scripts")
      .update({ content, version: nextVersion, updated_at: now })
      .eq("id", current.id)
      .eq("project_id", projectId)
      .select("id,version,updated_at")
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to update script: ${error.message}`);
    }
    const saved = (data ?? null) as RawScriptRow | null;
    return { id: saved?.id ?? current.id, version: saved?.version ?? nextVersion, document, updatedAt: saved?.updated_at ?? now };
  }

  const { data, error } = await supabase
    .from("scripts")
    .insert({ project_id: projectId, content, version: nextVersion })
    .select("id,version")
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to insert script: ${error.message}`);
  }
  const saved = (data ?? null) as RawScriptRow | null;
  return { id: saved?.id ?? null, version: saved?.version ?? nextVersion, document, updatedAt: now };
}


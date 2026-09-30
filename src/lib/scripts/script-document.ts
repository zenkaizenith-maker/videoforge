import type { AudioTrackSettings } from "@/lib/audio/types";
import type { SubtitleData } from "@/lib/subtitles/types";
import type { TransitionType, MotionEffect, CompositionSettings } from "@/lib/editor/types";
import type { RenderJobRecord } from "@/lib/render/types";
import type { PublishMetadata } from "@/lib/publish/types";

/**
 * Script Studio document model.
 *
 * The studio stores one structured document per project inside the existing
 * `scripts.content` column as JSON. No new tables are created and no existing
 * table is altered; the column already holds the script body written by the
 * project creation wizard.
 */

export const SCRIPT_STUDIO_FORMAT = "videoforge.script-studio.v1";

export const NARRATION_WORDS_PER_SECOND = 2.5;

export const MAX_SCENES = 24;

export interface ScriptScene {
  id: string;
  title: string;
  narration: string;
  visualDirection: string;
  estimatedDurationSeconds: number;
  transition?: TransitionType;
  transitionDurationSeconds?: number;
  motionEffect?: MotionEffect;
}

export interface ScriptDocument {
  title: string;
  hook: string;
  scenes: ScriptScene[];
  audioSettings?: Record<string, AudioTrackSettings>;
  subtitles?: SubtitleData;
  compositionSettings?: CompositionSettings;
  renderJobs?: RenderJobRecord[];
  publishMetadata?: PublishMetadata;
}

export interface ScriptDocumentEnvelope {
  format: string;
  document: ScriptDocument;
}

export interface ScriptStats {
  sceneCount: number;
  wordCount: number;
  totalDurationSeconds: number;
  narrationDurationSeconds: number;
}

export interface StoredScriptRecord {
  id: string | null;
  version: number;
  document: ScriptDocument;
  updatedAt: string | null;
}

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `scene-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function createScene(overrides: Partial<ScriptScene> = {}): ScriptScene {
  return {
    id: createId(),
    title: "New scene",
    narration: "",
    visualDirection: "",
    estimatedDurationSeconds: 15,
    ...overrides,
  };
}

export function createEmptyDocument(projectTitle: string): ScriptDocument {
  return { title: projectTitle, hook: "", scenes: [createScene()] };
}

export function countWords(value: string | null | undefined) {
  if (!value) return 0;
  const matches = value.trim().match(/[\p{L}\p{N}'’-]+/gu);
  return matches ? matches.length : 0;
}

export function estimateNarrationSeconds(value: string | null | undefined) {
  return Math.round(countWords(value) / NARRATION_WORDS_PER_SECOND);
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatDurationLabel(totalSeconds: number) {
  const safe = Math.max(0, Math.round(totalSeconds));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function getScriptStats(document: ScriptDocument): ScriptStats {
  const narrationWords = document.scenes.reduce((total, scene) => total + countWords(scene.narration), 0);
  return {
    sceneCount: document.scenes.length,
    wordCount: countWords(document.hook) + narrationWords,
    totalDurationSeconds: document.scenes.reduce((total, scene) => total + scene.estimatedDurationSeconds, 0),
    narrationDurationSeconds: Math.round(narrationWords / NARRATION_WORDS_PER_SECOND),
  };
}

function isScriptScene(value: unknown): value is ScriptScene {
  if (!value || typeof value !== "object") return false;
  const scene = value as Record<string, unknown>;
  return (
    typeof scene.id === "string" &&
    typeof scene.title === "string" &&
    typeof scene.narration === "string" &&
    typeof scene.visualDirection === "string" &&
    typeof scene.estimatedDurationSeconds === "number"
  );
}

function isScriptDocument(value: unknown): value is ScriptDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Record<string, unknown>;
  return (
    typeof document.title === "string" &&
    typeof document.hook === "string" &&
    Array.isArray(document.scenes) &&
    document.scenes.every(isScriptScene)
  );
}

/**
 * The wizard seeds `scripts.content` with a markdown outline. Parse it into a
 * studio document so a freshly created project opens with real content instead
 * of an empty editor.
 */
export function parseLegacyScriptOutline(content: string): Partial<ScriptDocument> | null {
  const trimmed = content.trim();
  if (!trimmed || trimmed.startsWith("{")) return null;

  const headingMatch = trimmed.match(/^#\s+(.+)$/m);
  const title = headingMatch ? headingMatch[1].trim() : "";

  const sceneMatches = [...trimmed.matchAll(/^###\s+(.+)$/gm)];
  if (sceneMatches.length === 0) return null;

  const scenes: ScriptScene[] = sceneMatches.map((match, index) => {
    const header = match[1].trim();
    const body = trimmed.slice((match.index ?? 0) + match[0].length, nextBoundary(sceneMatches[index + 1], trimmed));
    const rangeMatch = header.match(/\((\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})\)/);
    const estimatedDurationSeconds = rangeMatch
      ? toSeconds(rangeMatch[2]) - toSeconds(rangeMatch[1])
      : 15;
    const label = header
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/^Scene\s+\d+\s*[-–—:.]?\s*/i, "")
      .trim();
    return createScene({
      title: label || `Scene ${index + 1}`,
      narration: body.trim(),
      visualDirection: "",
      estimatedDurationSeconds: estimatedDurationSeconds > 0 ? estimatedDurationSeconds : 15,
    });
  });

  return { title, hook: scenes[0]?.narration ?? "", scenes };
}

function nextBoundary(next: RegExpExecArray | undefined, source: string) {
  if (!next) return source.length;
  return next.index ?? source.length;
}

function toSeconds(clock: string) {
  const [minutes, seconds] = clock.split(":").map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return 0;
  return minutes * 60 + seconds;
}

export function parseScriptDocument(
  content: string | null | undefined,
  fallbackTitle: string,
): { document: ScriptDocument; format: string } {
  if (content && content.trim()) {
    try {
      const parsed: unknown = JSON.parse(content);
      if (isScriptDocument(parsed)) {
        return { document: parsed, format: SCRIPT_STUDIO_FORMAT };
      }
      const envelope = parsed as Partial<ScriptDocumentEnvelope>;
      if (envelope && isScriptDocument(envelope.document)) {
        return {
          document: envelope.document,
          format: typeof envelope.format === "string" ? envelope.format : SCRIPT_STUDIO_FORMAT,
        };
      }
    } catch {
      // Fall through to the legacy markdown interpretation below.
    }

    const legacy = parseLegacyScriptOutline(content);
    if (legacy) {
      return {
        document: {
          title: legacy.title?.trim() || fallbackTitle,
          hook: legacy.hook ?? "",
          scenes: legacy.scenes?.length ? legacy.scenes : [createScene()],
        },
        format: "videoforge.script-outline.legacy",
      };
    }
  }

  return { document: createEmptyDocument(fallbackTitle), format: SCRIPT_STUDIO_FORMAT };
}

export function serializeScriptDocument(document: ScriptDocument, format = SCRIPT_STUDIO_FORMAT) {
  const envelope: ScriptDocumentEnvelope = { format, document };
  return JSON.stringify(envelope);
}

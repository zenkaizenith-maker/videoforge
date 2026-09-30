import type { ScriptScene } from "@/lib/scripts/script-document";
import type { PublishMetadata, VideoChapter } from "./types";
import { formatEditorClock } from "@/lib/editor/types";

export function generateChaptersFromScenes(scenes: ScriptScene[]): VideoChapter[] {
  let accum = 0;
  return scenes.map((scene, index) => {
    const start = accum;
    accum += scene.estimatedDurationSeconds || 15;

    const m = Math.floor(start / 60);
    const s = Math.floor(start % 60);
    const formatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

    return {
      title: scene.title || `Chapter ${index + 1}`,
      startTimeSeconds: start,
      formattedTime: formatted,
    };
  });
}

export function generatePublishMetadata(
  projectTitle: string,
  hook: string,
  scenes: ScriptScene[],
): PublishMetadata {
  const chapters = generateChaptersFromScenes(scenes);
  const chapterLines = chapters
    .map((c) => `${c.formattedTime} - ${c.title}`)
    .join("\n");

  const description = [
    hook.trim() || `In this video: ${projectTitle}`,
    "",
    "⏱ TIMESTAMPS / CHAPTERS:",
    chapterLines,
    "",
    "—",
    "Produced autonomously with VideoForge.",
    "#videoforge #creator #ai #videoessay",
  ].join("\n");

  // Generate tags from title keywords
  const titleWords = projectTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const tags = Array.from(new Set([...titleWords, "videoforge", "videoessay", "education", "contentcreator"])).slice(0, 10);

  return {
    title: projectTitle,
    description,
    tags,
    category: "Education",
    privacy: "unlisted",
    chapters,
    publishedAt: null,
    youtubeVideoId: null,
  };
}

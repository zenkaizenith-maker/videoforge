import type { ScriptScene } from "@/lib/scripts/script-document";
import type { SubtitleCue } from "./types";

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `cue-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

/** Splits text into readable chunks (max ~8 words per cue) */
function splitIntoPhrases(text: string): string[] {
  if (!text.trim()) return [];

  // First split by sentence boundaries (. ? ! or newline)
  const sentences = text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const phrases: string[] = [];

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    if (words.length <= 8) {
      phrases.push(sentence);
      continue;
    }

    // Chunk longer sentences into ~5-7 words each at punctuation or natural breaks
    let currentChunk: string[] = [];
    for (const word of words) {
      currentChunk.push(word);
      const isPunctuation = word.endsWith(",") || word.endsWith(";") || word.endsWith(":");
      if (currentChunk.length >= 6 || (currentChunk.length >= 4 && isPunctuation)) {
        phrases.push(currentChunk.join(" "));
        currentChunk = [];
      }
    }
    if (currentChunk.length > 0) {
      phrases.push(currentChunk.join(" "));
    }
  }

  return phrases;
}

/**
 * Generates timed subtitle cues from script scenes.
 * Distributes estimated scene duration across narration phrases based on word density.
 */
export function generateSubtitlesFromScenes(scenes: ScriptScene[]): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let timelineOffset = 0;

  for (let sIdx = 0; sIdx < scenes.length; sIdx++) {
    const scene = scenes[sIdx];
    const duration = Math.max(3, scene.estimatedDurationSeconds || 15);
    const sceneStart = timelineOffset;
    const sceneEnd = sceneStart + duration;

    const rawText = scene.narration.trim() || scene.title.trim();
    const phrases = splitIntoPhrases(rawText);

    if (phrases.length === 0) {
      // Advance timeline even if scene has no narration text
      timelineOffset += duration;
      continue;
    }

    // Compute total words in this scene's phrases
    const wordCounts = phrases.map((p) => p.split(/\s+/).length);
    const totalWords = wordCounts.reduce((acc, count) => acc + count, 0);

    let phraseStart = sceneStart;

    for (let pIdx = 0; pIdx < phrases.length; pIdx++) {
      const phrase = phrases[pIdx];
      const count = wordCounts[pIdx];

      // Proportional duration for this phrase
      const weight = totalWords > 0 ? count / totalWords : 1 / phrases.length;
      let phraseDuration = duration * weight;

      // Bound phrase duration (min 1.2s, max 6.0s if possible)
      phraseDuration = Math.max(1.2, phraseDuration);

      let phraseEnd = phraseStart + phraseDuration;
      if (pIdx === phrases.length - 1) {
        // Last phrase snaps to scene end minus small padding
        phraseEnd = Math.min(sceneEnd, phraseEnd);
      }

      cues.push({
        id: createId(),
        sceneId: scene.id,
        startTime: Number(phraseStart.toFixed(2)),
        endTime: Number(phraseEnd.toFixed(2)),
        text: phrase,
      });

      // Small pause between subtitle cues (0.15s)
      phraseStart = phraseEnd + 0.15;
    }

    timelineOffset += duration;
  }

  return cues;
}

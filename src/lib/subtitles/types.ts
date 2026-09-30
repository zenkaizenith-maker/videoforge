export type SubtitlePosition = "bottom" | "top" | "center";
export type SubtitleAlignment = "center" | "left" | "right";
export type SubtitlePreset = "cinematic" | "karaoke" | "classic" | "minimal" | "bold-yellow" | "boxed";

export interface SubtitleCue {
  id: string;
  sceneId?: string | null;
  startTime: number; // In seconds, e.g. 1.25
  endTime: number;   // In seconds, e.g. 4.50
  text: string;
}

export interface SubtitleStyle {
  preset: SubtitlePreset;
  fontSize: number;          // 14 to 48 px
  fontFamily: string;        // CSS font stack
  textColor: string;         // Hex code e.g. "#ffffff"
  backgroundColor: string;   // Hex or rgba
  highlightColor: string;    // Accent color e.g. "#facc15"
  position: SubtitlePosition;
  alignment: SubtitleAlignment;
  textTransform: "none" | "uppercase" | "capitalize";
  shadow: boolean;
}

export interface SubtitleData {
  enabled: boolean;
  cues: SubtitleCue[];
  style: SubtitleStyle;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  preset: "cinematic",
  fontSize: 22,
  fontFamily: "Inter, system-ui, sans-serif",
  textColor: "#ffffff",
  backgroundColor: "rgba(0, 0, 0, 0.65)",
  highlightColor: "#38bdf8",
  position: "bottom",
  alignment: "center",
  textTransform: "none",
  shadow: true,
};

export const SUBTITLE_PRESETS: Record<SubtitlePreset, Partial<SubtitleStyle>> = {
  cinematic: {
    preset: "cinematic",
    fontSize: 22,
    fontFamily: "Inter, system-ui, sans-serif",
    textColor: "#ffffff",
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    highlightColor: "#38bdf8",
    position: "bottom",
    alignment: "center",
    textTransform: "none",
    shadow: true,
  },
  karaoke: {
    preset: "karaoke",
    fontSize: 26,
    fontFamily: "Impact, Arial Black, sans-serif",
    textColor: "#facc15",
    backgroundColor: "transparent",
    highlightColor: "#ffffff",
    position: "bottom",
    alignment: "center",
    textTransform: "uppercase",
    shadow: true,
  },
  classic: {
    preset: "classic",
    fontSize: 20,
    fontFamily: "Arial, sans-serif",
    textColor: "#ffff00",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    highlightColor: "#ffffff",
    position: "bottom",
    alignment: "center",
    textTransform: "none",
    shadow: true,
  },
  minimal: {
    preset: "minimal",
    fontSize: 18,
    fontFamily: "system-ui, -apple-system, sans-serif",
    textColor: "#f3f4f6",
    backgroundColor: "transparent",
    highlightColor: "#60a5fa",
    position: "bottom",
    alignment: "center",
    textTransform: "none",
    shadow: true,
  },
  "bold-yellow": {
    preset: "bold-yellow",
    fontSize: 28,
    fontFamily: "Trebuchet MS, Montserrat, sans-serif",
    textColor: "#fef08a",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    highlightColor: "#f59e0b",
    position: "bottom",
    alignment: "center",
    textTransform: "uppercase",
    shadow: true,
  },
  boxed: {
    preset: "boxed",
    fontSize: 20,
    fontFamily: "Courier New, monospace",
    textColor: "#10b981",
    backgroundColor: "#000000",
    highlightColor: "#34d399",
    position: "bottom",
    alignment: "left",
    textTransform: "none",
    shadow: false,
  },
};

/** Formats a timestamp into HH:MM:SS,mmm (SRT) or HH:MM:SS.mmm (VTT) or MM:SS.m (clock) */
export function formatSubtitleTime(
  seconds: number,
  format: "srt" | "vtt" | "clock" = "clock",
): string {
  const safe = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe % 1) * 1000);

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(remainingSeconds).padStart(2, "0");
  const ms = String(milliseconds).padStart(3, "0");

  if (format === "srt") {
    return `${hh}:${mm}:${ss},${ms}`;
  }
  if (format === "vtt") {
    return `${hh}:${mm}:${ss}.${ms}`;
  }
  // Clock display for UI
  return `${mm}:${ss}.${String(Math.floor(milliseconds / 100))}`;
}

/** Parses timestamp strings back into float seconds */
export function parseSubtitleTime(timeStr: string): number {
  if (!timeStr || !timeStr.trim()) return 0;
  const cleaned = timeStr.trim().replace(",", ".");
  const parts = cleaned.split(":");

  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return parseFloat(cleaned) || 0;
}

/** Converts SubtitleCue array to standard SubRip (.srt) file content */
export function generateSrtContent(cues: SubtitleCue[]): string {
  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
  return sorted
    .map((cue, index) => {
      const idx = index + 1;
      const start = formatSubtitleTime(cue.startTime, "srt");
      const end = formatSubtitleTime(cue.endTime, "srt");
      return `${idx}\n${start} --> ${end}\n${cue.text.trim()}\n`;
    })
    .join("\n");
}

/** Converts SubtitleCue array to standard WebVTT (.vtt) file content */
export function generateVttContent(cues: SubtitleCue[]): string {
  const sorted = [...cues].sort((a, b) => a.startTime - b.startTime);
  const body = sorted
    .map((cue, index) => {
      const idx = index + 1;
      const start = formatSubtitleTime(cue.startTime, "vtt");
      const end = formatSubtitleTime(cue.endTime, "vtt");
      return `${idx}\n${start} --> ${end}\n${cue.text.trim()}\n`;
    })
    .join("\n");

  return `WEBVTT\n\n${body}`;
}

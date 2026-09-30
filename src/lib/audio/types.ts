export type AudioCategory = "narration" | "music" | "sfx";

export interface AudioTrack {
  id: string;
  projectId: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  durationSeconds: number | null;
  category: AudioCategory;
  volume: number; // 0 - 100
  isMuted: boolean;
  isLoop: boolean;
  assignedSceneId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AudioTrackSettings {
  category: AudioCategory;
  volume: number;
  isMuted: boolean;
  isLoop: boolean;
}

export type AudioFilter = "all" | AudioCategory | "unassigned";

export const AUDIO_ACCEPTED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
];

export const AUDIO_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const DEFAULT_CATEGORY_VOLUMES: Record<AudioCategory, number> = {
  narration: 100,
  music: 25,
  sfx: 75,
};

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds) || seconds <= 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

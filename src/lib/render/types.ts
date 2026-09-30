import type { AspectRatio, VideoResolution } from "@/lib/editor/types";
import type { JobStatus } from "@/types/domain";

export type RenderStep =
  | "queued"
  | "analyzing_timeline"
  | "mixing_audio"
  | "rendering_visuals"
  | "baking_subtitles"
  | "encoding_mp4"
  | "finalizing"
  | "completed"
  | "failed";

export interface RenderJobRecord {
  id: string;
  projectId: string;
  status: JobStatus;
  progress: number; // 0 - 100
  step: RenderStep;
  stepMessage: string;
  resolution: VideoResolution;
  aspectRatio: AspectRatio;
  fps: number;
  durationSeconds: number;
  outputVideoUrl: string | null;
  outputFileSize: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface RenderPreflight {
  sceneCount: number;
  visualsReadyCount: number;
  totalDurationSeconds: number;
  hasAudio: boolean;
  hasSubtitles: boolean;
  resolution: VideoResolution;
  aspectRatio: AspectRatio;
  isReadyToRender: boolean;
}

export const RENDER_STEPS: { step: RenderStep; label: string; progressRange: [number, number] }[] = [
  { step: "queued", label: "Queued in render pipeline", progressRange: [0, 5] },
  { step: "analyzing_timeline", label: "Analyzing scene timeline & transitions", progressRange: [5, 20] },
  { step: "mixing_audio", label: "Synthesizing voiceover & mixing soundtrack", progressRange: [20, 45] },
  { step: "rendering_visuals", label: "Rendering frames & camera motion", progressRange: [45, 75] },
  { step: "baking_subtitles", label: "Baking synchronized captions", progressRange: [75, 88] },
  { step: "encoding_mp4", label: "Encoding high-efficiency MP4 / H.264", progressRange: [88, 98] },
  { step: "finalizing", label: "Uploading master video package", progressRange: [98, 100] },
];

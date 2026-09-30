export type TransitionType = "cut" | "fade" | "dissolve" | "slide" | "zoom";
export type MotionEffect = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
export type AspectRatio = "16:9" | "9:16" | "1:1";
export type VideoResolution = "720p" | "1080p" | "4k";

export interface CompositionSettings {
  aspectRatio: AspectRatio;
  resolution: VideoResolution;
  fps: number; // 30 or 60
  masterVolume: number; // 0 - 100
  musicDucking: boolean;
}

export interface EditorSceneClip {
  id: string; // matches scene.id
  title: string;
  narration: string;
  visualDirection: string;
  durationSeconds: number;
  assignedAssetId: string | null;
  assignedAssetUrl: string | null;
  assignedAssetType: "image" | "video" | null;
  transition: TransitionType;
  transitionDurationSeconds: number;
  motionEffect: MotionEffect;
}

export interface EditorWorkspaceData {
  projectId: string;
  projectTitle: string;
  clips: EditorSceneClip[];
  settings: CompositionSettings;
  availableAssets: {
    id: string;
    originalFilename: string;
    mediaType: "image" | "video";
    signedUrl?: string;
  }[];
  totalDurationSeconds: number;
}

export const DEFAULT_COMPOSITION_SETTINGS: CompositionSettings = {
  aspectRatio: "16:9",
  resolution: "1080p",
  fps: 30,
  masterVolume: 100,
  musicDucking: true,
};

export function formatEditorClock(seconds: number): string {
  const safe = Math.max(0, isNaN(seconds) ? 0 : seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
}

export type AssetMediaType = "image" | "video" | "audio";

export interface AssetRecord {
  id: string;
  projectId: string;
  originalFilename: string;
  storagePath: string;
  mediaType: AssetMediaType;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  assignedSceneId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AssetFilter = "all" | "image" | "video" | "audio" | "unassigned";

export const ASSET_ACCEPTED_TYPES: Record<AssetMediaType, string[]> = {
  image: ["image/png", "image/jpeg", "image/webp"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"],
};

export const ASSET_MAX_FILE_SIZE = 50 * 1024 * 1024;

export function mediaTypeForMime(mime: string): AssetMediaType | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

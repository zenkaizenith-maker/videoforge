export type VideoPrivacy = "public" | "unlisted" | "private";
export type PublishPlatform = "youtube" | "tiktok" | "download" | "embed";

export interface VideoChapter {
  title: string;
  startTimeSeconds: number;
  formattedTime: string; // e.g. "00:00"
}

export interface PublishMetadata {
  title: string;
  description: string;
  tags: string[];
  category: string;
  privacy: VideoPrivacy;
  chapters: VideoChapter[];
  publishedAt: string | null;
  youtubeVideoId: string | null;
}

export interface PublishStudioData {
  projectId: string;
  projectTitle: string;
  metadata: PublishMetadata;
  masterVideoUrl: string | null;
  videoDurationSeconds: number;
  aspectRatio: string;
  resolution: string;
  isRendered: boolean;
  isYouTubeConnected: boolean;
  srtContent: string | null;
  vttContent: string | null;
}


export const DEFAULT_PUBLISH_METADATA: PublishMetadata = {
  title: "",
  description: "",
  tags: ["videoforge", "contentcreator", "videoessay"],
  category: "Education",
  privacy: "unlisted",
  chapters: [],
  publishedAt: null,
  youtubeVideoId: null,
};

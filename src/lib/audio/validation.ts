import { z } from "zod";
import { AUDIO_ACCEPTED_TYPES, AUDIO_MAX_FILE_SIZE } from "./types";

export const audioCategorySchema = z.enum(["narration", "music", "sfx"]);

export const uploadAudioSchema = z.object({
  projectId: z.string().trim().min(1, "A project is required.").max(128),
  category: audioCategorySchema.default("music"),
  sceneId: z.string().trim().max(80).nullable().optional(),
  file: z
    .instanceof(File)
    .refine((file) => file.size <= AUDIO_MAX_FILE_SIZE, {
      message: `Audio files must be smaller than ${Math.round(AUDIO_MAX_FILE_SIZE / 1024 / 1024)} MB.`,
    })
    .refine(
      (file) => AUDIO_ACCEPTED_TYPES.includes(file.type) || file.type.startsWith("audio/"),
      { message: "Unsupported audio file type. Please use MP3, WAV, M4A, AAC, or OGG." },
    ),
});

export const updateAudioTrackSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  trackId: z.string().trim().min(1),
  category: audioCategorySchema.optional(),
  volume: z.number().min(0).max(100).optional(),
  isMuted: z.boolean().optional(),
  isLoop: z.boolean().optional(),
  assignedSceneId: z.string().trim().max(80).nullable().optional(),
});

export const deleteAudioTrackSchema = z.object({
  projectId: z.string().trim().min(1).max(128),
  trackId: z.string().trim().min(1),
});

import { z } from "zod";

export const transitionSchema = z.enum(["cut", "fade", "dissolve", "slide", "zoom"]);
export const motionEffectSchema = z.enum(["none", "zoom-in", "zoom-out", "pan-left", "pan-right"]);
export const aspectRatioSchema = z.enum(["16:9", "9:16", "1:1"]);
export const resolutionSchema = z.enum(["720p", "1080p", "4k"]);

export const compositionSettingsSchema = z.object({
  aspectRatio: aspectRatioSchema,
  resolution: resolutionSchema,
  fps: z.union([z.literal(30), z.literal(60)]),
  masterVolume: z.number().min(0).max(100),
  musicDucking: z.boolean(),
});

export const updateClipPropertiesSchema = z.object({
  projectId: z.string().trim().min(1),
  sceneId: z.string().trim().min(1),
  durationSeconds: z.number().min(1).max(300).optional(),
  transition: transitionSchema.optional(),
  transitionDurationSeconds: z.number().min(0).max(5).optional(),
  motionEffect: motionEffectSchema.optional(),
  assignedAssetId: z.string().nullable().optional(),
});

export const saveCompositionSettingsSchema = z.object({
  projectId: z.string().trim().min(1),
  settings: compositionSettingsSchema,
});

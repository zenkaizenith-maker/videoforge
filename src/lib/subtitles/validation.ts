import { z } from "zod";

export const subtitlePositionSchema = z.enum(["bottom", "top", "center"]);
export const subtitleAlignmentSchema = z.enum(["center", "left", "right"]);
export const subtitlePresetSchema = z.enum([
  "cinematic",
  "karaoke",
  "classic",
  "minimal",
  "bold-yellow",
  "boxed",
]);

export const subtitleCueSchema = z
  .object({
    id: z.string().trim().min(1),
    sceneId: z.string().trim().nullable().optional(),
    startTime: z.number().min(0, "Start time must be 0 or greater."),
    endTime: z.number().min(0, "End time must be 0 or greater."),
    text: z.string().trim().min(1, "Subtitle text cannot be empty.").max(500),
  })
  .refine((data) => data.startTime <= data.endTime, {
    message: "Start time must precede end time.",
    path: ["endTime"],
  });

export const subtitleStyleSchema = z.object({
  preset: subtitlePresetSchema,
  fontSize: z.number().min(12).max(64),
  fontFamily: z.string().trim().min(1),
  textColor: z.string().trim().min(1),
  backgroundColor: z.string().trim().min(1),
  highlightColor: z.string().trim().min(1),
  position: subtitlePositionSchema,
  alignment: subtitleAlignmentSchema,
  textTransform: z.enum(["none", "uppercase", "capitalize"]),
  shadow: z.boolean(),
});

export const saveSubtitlesSchema = z.object({
  projectId: z.string().trim().min(1, "Project ID is required."),
  enabled: z.boolean(),
  cues: z.array(subtitleCueSchema),
  style: subtitleStyleSchema,
});

export const updateCueSchema = z.object({
  projectId: z.string().trim().min(1),
  cue: subtitleCueSchema,
});

export const deleteCueSchema = z.object({
  projectId: z.string().trim().min(1),
  cueId: z.string().trim().min(1),
});

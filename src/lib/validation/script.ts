import { z } from "zod";
import { MAX_SCENES } from "@/lib/scripts/script-document";

export const scriptSceneSchema = z.object({
  id: z.string().trim().min(1, "Every scene needs an identifier.").max(80),
  title: z.string().trim().min(1, "Give the scene a title.").max(160, "Scene titles are limited to 160 characters."),
  narration: z
    .string()
    .trim()
    .min(1, "Write the narration for this scene.")
    .max(4_000, "Scene narration is limited to 4000 characters."),
  visualDirection: z
    .string()
    .trim()
    .min(1, "Describe what the viewer sees in this scene.")
    .max(1_000, "Visual direction is limited to 1000 characters."),
  estimatedDurationSeconds: z
    .number()
    .int("Duration must be a whole number of seconds.")
    .min(1, "Duration must be at least one second.")
    .max(600, "A single scene cannot exceed 600 seconds."),
});

export const scriptDocumentSchema = z.object({
  title: z.string().trim().min(1, "Give the script a title.").max(160, "Script titles are limited to 160 characters."),
  hook: z.string().trim().max(2_000, "The hook is limited to 2000 characters."),
  scenes: z
    .array(scriptSceneSchema)
    .min(1, "A script needs at least one scene.")
    .max(MAX_SCENES, `A script cannot exceed ${MAX_SCENES} scenes.`),
});

export const saveScriptInputSchema = z.object({
  projectId: z.string().trim().min(1, "A project is required.").max(128),
  document: scriptDocumentSchema,
});

export const generateScriptInputSchema = z.object({
  projectId: z.string().trim().min(1, "A project is required.").max(128),
  sceneCount: z.number().int().min(1).max(MAX_SCENES).optional(),
});

export const regenerateSceneInputSchema = z.object({
  projectId: z.string().trim().min(1, "A project is required.").max(128),
  scene: scriptSceneSchema,
  direction: z.string().trim().max(2_000).optional(),
});

export type ScriptSceneInput = z.infer<typeof scriptSceneSchema>;
export type ScriptDocumentInput = z.infer<typeof scriptDocumentSchema>;
export type SaveScriptInput = z.infer<typeof saveScriptInputSchema>;
export type GenerateScriptInput = z.infer<typeof generateScriptInputSchema>;
export type RegenerateSceneInput = z.infer<typeof regenerateSceneInputSchema>;

import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, "A project title is required.").max(120),
  topic: z.string().trim().min(8, "Describe the topic in at least 8 characters.").max(2_000),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

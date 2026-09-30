export type ProjectStatus = "draft" | "active" | "archived";
export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";
export type JobType = "script" | "scene-plan" | "asset" | "voice" | "subtitles" | "thumbnail" | "render" | "metadata" | "publish";

export interface Project { id: string; ownerId: string; title: string; topic: string | null; status: ProjectStatus; createdAt: string; updatedAt: string; }
export interface ProductionJob { id: string; projectId: string; type: JobType; status: JobStatus; progress: number; currentStep: string | null; errorMessage: string | null; createdAt: string; startedAt: string | null; completedAt: string | null; }
export interface RenderRequest { projectId: string; renderJobId: string; callbackUrl: string; }

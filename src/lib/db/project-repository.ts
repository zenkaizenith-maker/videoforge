import type { Project } from "@/types/domain";

/** Database boundary only. A Supabase-backed implementation is added with project creation. */
export interface ProjectRepository {
  listForOwner(ownerId: string): Promise<Project[]>;
  findByIdForOwner(projectId: string, ownerId: string): Promise<Project | null>;
}

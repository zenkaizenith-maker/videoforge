import type { ProjectStatus } from "@/types/domain";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`status ${status === "draft" ? "draft" : ""}`}>{status}</span>;
}

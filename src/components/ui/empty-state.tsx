import type { ReactNode } from "react";

export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel card" aria-live="polite"><h2>{title}</h2><p>{children}</p></section>;
}

import { Skeleton } from "@/components/ui/feedback";

export default function ScenesLoading() {
  return (
    <div className="studio">
      <header className="studio-head">
        <div>
          <div className="eyebrow">Scene Builder</div>
          <h1>Loading scenes…</h1>
        </div>
      </header>
      <section className="studio-metrics" aria-label="Scene statistics">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="studio-metric" key={i}>
            <Skeleton style={{ width: "60px", height: "10px", marginBottom: "8px" }} />
            <Skeleton style={{ width: "40px", height: "22px" }} />
          </div>
        ))}
      </section>
      <div className="studio-grid">
        <aside className="panel studio-outline" aria-label="Scene outline">
          <div style={{ display: "grid", gap: "8px" }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ width: "100%", height: "52px" }} />
            ))}
          </div>
        </aside>
        <div className="studio-editor">
          <Skeleton style={{ width: "100%", height: "420px" }} />
        </div>
      </div>
    </div>
  );
}

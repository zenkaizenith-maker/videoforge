import { Skeleton } from "@/components/ui/feedback";

export default function RenderLoading() {
  return (
    <div className="studio">
      <header className="studio-head">
        <div>
          <div className="eyebrow">Render Studio</div>
          <h1>Loading render pipeline…</h1>
        </div>
      </header>
      <section className="studio-metrics" aria-label="Render statistics">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="studio-metric" key={i}>
            <Skeleton style={{ width: "70px", height: "10px", marginBottom: "8px" }} />
            <Skeleton style={{ width: "40px", height: "22px" }} />
          </div>
        ))}
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: "20px", marginTop: "14px" }}>
        <Skeleton style={{ width: "100%", height: "340px", borderRadius: "14px" }} />
        <Skeleton style={{ width: "100%", height: "340px", borderRadius: "14px" }} />
      </div>
    </div>
  );
}

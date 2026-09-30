import { Skeleton } from "@/components/ui/feedback";

export default function PublishLoading() {
  return (
    <div className="studio">
      <header className="studio-head">
        <div>
          <div className="eyebrow">Publish Studio</div>
          <h1>Loading distribution channels…</h1>
        </div>
      </header>
      <section className="studio-metrics" aria-label="Publish statistics">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="studio-metric" key={i}>
            <Skeleton style={{ width: "70px", height: "10px", marginBottom: "8px" }} />
            <Skeleton style={{ width: "40px", height: "22px" }} />
          </div>
        ))}
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px", marginTop: "14px" }}>
        <Skeleton style={{ width: "100%", height: "420px", borderRadius: "14px" }} />
        <Skeleton style={{ width: "100%", height: "420px", borderRadius: "14px" }} />
      </div>
    </div>
  );
}

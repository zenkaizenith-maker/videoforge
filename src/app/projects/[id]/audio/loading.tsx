import { Skeleton } from "@/components/ui/feedback";

export default function AudioLoading() {
  return (
    <div className="studio">
      <header className="studio-head">
        <div>
          <div className="eyebrow">Audio Studio</div>
          <h1>Loading audio library…</h1>
        </div>
      </header>
      <section className="studio-metrics" aria-label="Audio statistics">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="studio-metric" key={i}>
            <Skeleton style={{ width: "70px", height: "10px", marginBottom: "8px" }} />
            <Skeleton style={{ width: "40px", height: "22px" }} />
          </div>
        ))}
      </section>
      <div style={{ display: "grid", gap: "12px", marginTop: "14px" }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} style={{ width: "100%", height: "76px", borderRadius: "12px" }} />
        ))}
      </div>
    </div>
  );
}

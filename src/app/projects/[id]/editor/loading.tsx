import { Skeleton } from "@/components/ui/feedback";

export default function EditorLoading() {
  return (
    <div className="studio">
      <header className="studio-head">
        <div>
          <div className="eyebrow">Video Editor</div>
          <h1>Loading composition timeline…</h1>
        </div>
      </header>
      <section className="studio-metrics" aria-label="Editor statistics">
        {Array.from({ length: 5 }).map((_, i) => (
          <div className="studio-metric" key={i}>
            <Skeleton style={{ width: "70px", height: "10px", marginBottom: "8px" }} />
            <Skeleton style={{ width: "40px", height: "22px" }} />
          </div>
        ))}
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "20px", marginTop: "14px" }}>
        <Skeleton style={{ width: "100%", height: "360px", borderRadius: "14px" }} />
        <Skeleton style={{ width: "100%", height: "360px", borderRadius: "14px" }} />
      </div>
      <Skeleton style={{ width: "100%", height: "120px", borderRadius: "14px", marginTop: "16px" }} />
    </div>
  );
}

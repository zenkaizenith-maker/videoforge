export default function ScriptStudioLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="vf-skeleton" style={{ height: 18, width: 140, marginBottom: 14 }} />
      <div className="vf-skeleton" style={{ height: 34, width: "min(520px, 80%)", marginBottom: 10 }} />
      <div className="vf-skeleton" style={{ height: 16, width: "min(640px, 90%)", marginBottom: 26 }} />
      <div className="studio-grid">
        <div className="vf-skeleton" style={{ height: 380 }} />
        <div className="vf-skeleton" style={{ height: 380 }} />
      </div>
      <p className="subtle" style={{ marginTop: 14 }}>
        Loading your script…
      </p>
    </div>
  );
}

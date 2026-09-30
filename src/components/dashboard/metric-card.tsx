export function MetricCard({ label, value }: { label: string; value: string }) {
  return <div className="panel metric"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong></div>;
}

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AssetsPage() { const user = await getCurrentUser(); return <DashboardShell active="Assets" user={user}><div className="page-head"><div><div className="eyebrow">Asset library</div><h1>Keep every visual in one place.</h1><p className="subtle">Uploads will be enabled with the private storage phase.</p></div></div><EmptyState title="No assets yet"><Button disabled>Upload asset</Button></EmptyState></DashboardShell>; }

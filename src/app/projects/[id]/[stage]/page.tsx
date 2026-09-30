import { AppNav } from "@/components/app-nav";

// "script" has its own dedicated route at /projects/[id]/script.
const validStages = new Set(["scenes", "assets", "audio", "subtitles", "editor", "render", "publish"]);

export default async function StagePage({ params }: { params: Promise<{ id: string; stage: string }> }) { const { id, stage } = await params; const title = validStages.has(stage) ? stage[0].toUpperCase() + stage.slice(1) : "Workspace"; return <><AppNav /><main className="shell"><section className="panel route-card"><div className="eyebrow">{title} workspace</div><h1>{title}</h1><p className="subtle">Project <code>{id}</code>. This intentional placeholder reserves the route and its API boundary; it does not simulate completed media work.</p></section></main></>; }

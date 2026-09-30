"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Tooltip } from "@/components/ui/overlay";

const navigation = [["Dashboard", "/dashboard", "⌂"], ["Projects", "/projects", "▣"], ["Templates", "/templates", "◇"], ["Assets", "/assets", "◫"], ["Settings", "/settings/profile", "⚙"]] as const;
type Props = { children: ReactNode; active?: string; user?: { displayName: string; email: string } | null };
export function DashboardShell({ children, active = "Dashboard", user }: Props) {
  const [open, setOpen] = useState(false); const [theme, setTheme] = useState<"dark" | "light">("dark");
  const initials = user?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "VF";
  const toggleTheme = () => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.dataset.theme = next; };
  const links = <nav className="side-nav" aria-label="Primary navigation">{navigation.map(([label, href, icon]) => <Link href={href} className={`side-link ${active === label ? "active" : ""}`} key={label} onClick={() => setOpen(false)}><span className="side-icon" aria-hidden="true">{icon}</span>{label}</Link>)}</nav>;
  return <div className="app-frame"><aside className="app-sidebar"><div className="app-brand"><Brand /></div>{links}<div className="side-separator" /><div className="sidebar-usage"><strong>Render usage</strong><p>0 of 60 minutes used</p><div className="vf-progress"><span style={{ width: "0%" }} /></div></div>{user && <div className="sidebar-account"><span className="avatar" aria-hidden="true">{initials}</span><div><strong>{user.displayName}</strong><small>{user.email}</small></div><SignOutButton /></div>}</aside><div className="app-main"><header className="app-topbar"><label className="app-search"><span aria-hidden="true">⌕</span><input aria-label="Search workspace" placeholder="Search projects and assets" /></label><div className="top-actions"><Tooltip label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><button className="icon-button" onClick={toggleTheme} aria-label="Toggle color mode">{theme === "dark" ? "☼" : "☾"}</button></Tooltip><Tooltip label="Notifications"><button className="icon-button" aria-label="Notifications">♧</button></Tooltip><Tooltip label={user ? `${user.displayName} (${user.email})` : "Account"}><span className="avatar" aria-label={user ? `Signed in as ${user.displayName}` : "Account"}>{initials}</span></Tooltip></div></header><header className="mobile-header"><Brand /><div><button className="icon-button" onClick={toggleTheme} aria-label="Toggle color mode">{theme === "dark" ? "☼" : "☾"}</button><button className="icon-button" onClick={() => setOpen(!open)} aria-label="Open navigation" aria-expanded={open}>☰</button></div></header>{open && <div className="mobile-nav-panel">{links}{user && <div className="mobile-account"><span>{user.displayName}</span><SignOutButton /></div>}</div>}<div className="app-content">{children}</div></div></div>;
}

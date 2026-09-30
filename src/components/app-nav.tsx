import Link from "next/link";
import { Brand } from "@/components/brand";

export function AppNav() { return <header className="shell"><nav className="nav"><Brand /><div className="nav-links"><Link href="/dashboard">Dashboard</Link><Link href="/projects">Projects</Link><Link href="/templates">Templates</Link><Link href="/settings/profile">Settings</Link></div></nav></header>; }

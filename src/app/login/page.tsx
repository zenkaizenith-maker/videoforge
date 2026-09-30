import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/auth/auth-forms";

export default function Login() { return <main className="shell"><div className="nav"><Brand /><Link className="button secondary" href="/signup">Create account</Link></div><section className="panel form-card"><div className="eyebrow">Welcome back</div><h1>Sign in to VideoForge</h1><p className="subtle">Pick up where your production flow left off.</p><Suspense fallback={<p className="subtle">Preparing secure sign in…</p>}><LoginForm /></Suspense><p className="auth-switch">New here? <Link href="/signup">Create an account</Link></p></section></main>; }

import Link from "next/link";
import { Brand } from "@/components/brand";
import { SignupForm } from "@/components/auth/auth-forms";

export default function Signup() { return <main className="shell"><div className="nav"><Brand /><Link className="button secondary" href="/login">Sign in</Link></div><section className="panel form-card"><div className="eyebrow">Start free</div><h1>Build your first project</h1><p className="subtle">Create your workspace in a few seconds.</p><SignupForm /><p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p></section></main>; }

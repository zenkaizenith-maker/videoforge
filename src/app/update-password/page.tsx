import Link from "next/link";
import { Brand } from "@/components/brand";
import { UpdatePasswordForm } from "@/components/auth/auth-forms";

export default function UpdatePasswordPage() { return <main className="shell"><div className="nav"><Brand /><Link className="button secondary" href="/login">Back to sign in</Link></div><section className="panel form-card"><div className="eyebrow">Account recovery</div><h1>Choose a new password</h1><p className="subtle">Use a password you haven’t used elsewhere.</p><UpdatePasswordForm /></section></main>; }

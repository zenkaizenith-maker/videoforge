import Link from "next/link";
import { Brand } from "@/components/brand";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export default function ForgotPasswordPage() { return <main className="shell"><div className="nav"><Brand /><Link className="button secondary" href="/login">Back to sign in</Link></div><section className="panel form-card"><div className="eyebrow">Account recovery</div><h1>Reset your password</h1><p className="subtle">We’ll email you a secure link if this address has an account.</p><ForgotPasswordForm /></section></main>; }

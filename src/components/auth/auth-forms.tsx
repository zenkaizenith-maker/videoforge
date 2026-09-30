"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { authErrorMessage, isValidEmail } from "@/lib/auth/auth-errors";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form-fields";

function safeNext(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard"; }
function Message({ error, success }: { error?: string; success?: string }) { return error ? <p className="auth-message error" role="alert">{error}</p> : success ? <p className="auth-message success" role="status">{success}</p> : null; }

export function LoginForm() {
  const router = useRouter(); const search = useSearchParams();
  const [error, setError] = useState(search.get("error") === "session" ? "Your session has expired. Please sign in again." : "");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const form = new FormData(event.currentTarget); const email = String(form.get("email") ?? "").trim(); const password = String(form.get("password") ?? "");
    if (!isValidEmail(email)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    setPending(true);
    const client = createClient();
    const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
    if (authError) { setPending(false); return setError(authErrorMessage(authError.message)); }
    if (authData?.user) {
      const displayName =
        authData.user.user_metadata?.display_name ||
        authData.user.email?.split("@")[0] ||
        "Creator";
      await client.from("profiles").upsert(
        { id: authData.user.id, display_name: displayName },
        { onConflict: "id" }
      );
    }
    router.replace(safeNext(search.get("next"))); router.refresh();
  }
  return <form className="auth-form" onSubmit={submit} noValidate><Message error={error} /><Field label="Email"><Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></Field><Field label="Password"><Input name="password" type="password" autoComplete="current-password" placeholder="Your password" required /></Field><div className="auth-inline"><Link href="/forgot-password">Forgot password?</Link></div><Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button></form>;
}

export function SignupForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    const form = new FormData(event.currentTarget); const displayName = String(form.get("name") ?? "").trim().slice(0, 80); const email = String(form.get("email") ?? "").trim(); const password = String(form.get("password") ?? "");
    if (!displayName) return setError("Enter the name you want to use in VideoForge.");
    if (!isValidEmail(email)) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Choose a password with at least 8 characters.");
    setPending(true);
    const client = createClient();
    const { data, error: authError } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`, data: { display_name: displayName } } });
    if (authError) { setPending(false); return setError(authErrorMessage(authError.message)); }
    if (data.user?.identities?.length === 0) { setPending(false); return setError("An account with this email already exists. Try signing in instead."); }
    if (data.user && data.session) {
      const { error: profileError } = await client.from("profiles").upsert({ id: data.user.id, display_name: displayName });
      if (profileError) { setPending(false); return setError("Your account was created, but we couldn't prepare your profile. Please sign in again."); }
      router.replace("/dashboard"); router.refresh(); return;
    }
    setPending(false); setSuccess("Check your inbox to confirm your email address, then return here to sign in.");
  }
  return <form className="auth-form" onSubmit={submit} noValidate><Message error={error} success={success} /><Field label="Name"><Input name="name" autoComplete="name" placeholder="Your name" required /></Field><Field label="Email"><Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></Field><Field label="Password"><Input name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required /></Field><Button type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</Button></form>;
}

export function ForgotPasswordForm() {
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!isValidEmail(email)) return setError("Enter a valid email address.");
    setPending(true);
    const { error: authError } = await createClient().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/update-password` });
    setPending(false);
    if (authError) return setError(authErrorMessage(authError.message));
    setSuccess("If an account uses that email, a password-reset link is on its way.");
  }
  return <form className="auth-form" onSubmit={submit} noValidate><Message error={error} success={success} /><Field label="Email"><Input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></Field><Button type="submit" disabled={pending}>{pending ? "Sending link…" : "Send reset link"}</Button></form>;
}

export function UpdatePasswordForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); const password = String(new FormData(event.currentTarget).get("password") ?? "");
    if (password.length < 8) return setError("Choose a password with at least 8 characters.");
    setPending(true); const { error: authError } = await createClient().auth.updateUser({ password }); setPending(false);
    if (authError) return setError(authErrorMessage(authError.message));
    setSuccess("Password updated. You can now sign in."); setTimeout(() => router.replace("/login"), 900);
  }
  return <form className="auth-form" onSubmit={submit} noValidate><Message error={error} success={success} /><Field label="New password"><Input name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required /></Field><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save new password"}</Button></form>;
}

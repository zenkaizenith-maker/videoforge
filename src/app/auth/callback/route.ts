import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) { return value?.startsWith("/") && !value.startsWith("//") ? value : "/dashboard"; }

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNext(requestUrl.searchParams.get("next"));
  if (!code) return NextResponse.redirect(new URL("/login?error=session", requestUrl.origin));
  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=session", requestUrl.origin));
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const storedName = user.user_metadata?.display_name;
    const displayName = typeof storedName === "string" ? storedName.trim().slice(0, 80) : null;
    await supabase.from("profiles").upsert({ id: user.id, display_name: displayName });
  }
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

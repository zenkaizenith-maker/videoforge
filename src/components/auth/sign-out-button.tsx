"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true);
    await createClient().auth.signOut();
    router.replace("/");
    router.refresh();
  }
  return <Button variant="ghost" size="sm" onClick={signOut} disabled={pending}>{pending ? "Signing out…" : "Sign out"}</Button>;
}

import { createClient } from "@/lib/supabase/server";

export type CurrentUser = { id: string; email: string; displayName: string };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  let profileName = "";
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (typeof profile?.display_name === "string" && profile.display_name.trim()) {
      profileName = profile.display_name.trim();
    } else {
      const fallbackName =
        typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
          ? user.user_metadata.display_name.trim()
          : user.email.split("@")[0] || "Creator";
      await supabase.from("profiles").upsert(
        { id: user.id, display_name: fallbackName },
        { onConflict: "id" }
      );
      profileName = fallbackName;
    }
  } catch {
    // Continue with auth user metadata fallback
  }

  const metadataName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "";
  const emailName = user.email.split("@")[0];
  const capitalizedEmailName = emailName ? emailName.charAt(0).toUpperCase() + emailName.slice(1) : "Creator";

  return {
    id: user.id,
    email: user.email,
    displayName: profileName || metadataName || capitalizedEmailName,
  };
}

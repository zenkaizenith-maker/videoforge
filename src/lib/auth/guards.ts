import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors/app-error";

export async function requireAuthenticatedUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (error || typeof userId !== "string") throw new AppError("Please sign in to continue.", "UNAUTHENTICATED", 401, error);
  return userId;
}

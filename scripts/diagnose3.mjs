import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "fs";

function loadEnv() {
  const content = readFileSync(".env.local", "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    env[key] = value;
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing credentials");
  process.exit(1);
}

async function diagnose() {
  // Simulate empty cookies (like a server component without session)
  const cookieStore = new Map();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return Array.from(cookieStore.values());
      },
      setAll(items) {
        items.forEach(({ name, value, options }) => cookieStore.set(name, { name, value, options }));
      },
    },
  });

  // Try to query assets table without auth
  console.log("[1] Querying assets without auth session...");
  const { data, error } = await supabase
    .from("assets")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.log("FAIL:", error.message);
    console.log("CODE:", error.code);
  } else {
    console.log("PASS: count =", data?.length ?? 0);
  }

  // Try with a real project ID from the logs
  const projectId = "b1805071-797a-4aa7-9bc4-199b0785440a";
  console.log("\n[2] Querying assets for project:", projectId);
  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (assetsError) {
    console.log("FAIL:", assetsError.message);
    console.log("CODE:", assetsError.code);
    console.log("DETAILS:", assetsError.details);
    console.log("HINT:", assetsError.hint);
  } else {
    console.log("PASS: got", assets?.length ?? 0, "assets");
  }
}

diagnose().catch(console.error);

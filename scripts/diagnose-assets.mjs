import { createClient } from "@supabase/supabase-js";
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
const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !publishableKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

async function diagnose() {
  console.log("=== Diagnostic ===\n");

  // Use publishable key (same as server.ts)
  const supabase = createClient(url, publishableKey);

  // 1. Check auth
  console.log("[1] Checking auth...");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    console.log("FAIL: no authenticated user:", authError?.message);
    return;
  }
  console.log("PASS: authenticated as:", user.email, "id:", user.id);

  // 2. Find owned project
  console.log("\n[2] Finding owned project...");
  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id,title,owner_id")
    .eq("owner_id", user.id)
    .limit(1);

  if (projectsError || !projects?.length) {
    console.log("FAIL: no owned projects:", projectsError?.message);
    return;
  }
  const project = projects[0];
  console.log("PASS: project:", project.id, project.title);

  // 3. Query assets table (this is what listProjectAssets does)
  console.log("\n[3] Querying assets table...");
  const { data: assets, error: assetsError, count } = await supabase
    .from("assets")
    .select("*", { count: "exact" })
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (assetsError) {
    console.log("FAIL: assets query error:", assetsError.message);
    console.log("CODE:", assetsError.code);
    console.log("DETAILS:", assetsError.details);
    console.log("HINT:", assetsError.hint);
  } else {
    console.log("PASS: assets query ok. Count:", count ?? 0);
    if (assets?.length) {
      console.log("  first asset:", assets[0].original_filename, assets[0].media_type);
    }
  }

  // 4. Try unassigned filter
  console.log("\n[4] Trying unassigned filter...");
  const { data: unassigned, error: unassignedError } = await supabase
    .from("assets")
    .select("*", { count: "exact" })
    .eq("project_id", project.id)
    .or("assigned_scene_id.is.null,assigned_scene_id.eq.");

  if (unassignedError) {
    console.log("FAIL: unassigned filter error:", unassignedError.message);
    console.log("CODE:", unassignedError.code);
  } else {
    console.log("PASS: unassigned filter ok. Count:", unassigned?.length ?? 0);
  }

  // 5. Try text search
  console.log("\n[5] Trying text search...");
  const { data: searched, error: searchedError } = await supabase
    .from("assets")
    .select("*", { count: "exact" })
    .eq("project_id", project.id)
    .ilike("original_filename", "%test%");

  if (searchedError) {
    console.log("FAIL: search error:", searchedError.message);
    console.log("CODE:", searchedError.code);
  } else {
    console.log("PASS: search ok. Count:", searched?.length ?? 0);
  }

  // 6. Check if service role key works
  if (secretKey) {
    console.log("\n[6] Testing service role client...");
    const serviceSupabase = createClient(url, secretKey, { auth: { persistSession: false } });
    const { data: srAssets, error: srError } = await serviceSupabase
      .from("assets")
      .select("*", { count: "exact" })
      .eq("project_id", project.id);

    if (srError) {
      console.log("FAIL: service role assets error:", srError.message);
    } else {
      console.log("PASS: service role ok. Count:", srAssets?.length ?? 0);
    }
  } else {
    console.log("\n[6] SKIP: no service role key configured");
  }

  console.log("\n=== Diagnostic complete ===");
}

diagnose().catch((err) => {
  console.error("Diagnostic error:", err.message);
  process.exit(1);
});

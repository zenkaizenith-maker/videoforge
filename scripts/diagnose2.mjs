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

if (!url || !publishableKey) {
  console.error("Missing credentials");
  process.exit(1);
}

async function diagnose() {
  const supabase = createClient(url, publishableKey);

  // Get a project
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    console.log("No auth session, trying anon queries...");
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id,title,owner_id")
    .limit(1);

  if (!projects?.length) {
    console.log("No projects found");
    return;
  }

  const project = projects[0];
  console.log("Project:", project.id, project.title);

  // Try the exact same query as listProjectAssets
  console.log("\nTrying listProjectAssets query...");
  const { data, error } = await supabase
    .from("assets")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.log("FAIL:", error.message);
    console.log("CODE:", error.code);
    console.log("DETAILS:", error.details);
    console.log("HINT:", error.hint);
  } else {
    console.log("PASS: got", data?.length ?? 0, "assets");
  }

  // Try head query
  console.log("\nTrying head query...");
  const { count, error: headError } = await supabase
    .from("assets")
    .select("*", { count: "exact", head: true });

  if (headError) {
    console.log("FAIL:", headError.message);
    console.log("CODE:", headError.code);
  } else {
    console.log("PASS: count =", count);
  }
}

diagnose().catch(console.error);

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
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function diagnose() {
  const supabase = createClient(url, key);

  console.log("[1] Head query on assets...");
  const { count, error: e1 } = await supabase.from("assets").select("*", { count: "exact", head: true });
  console.log(e1 ? "FAIL: " + e1.message + " (" + e1.code + ")" : "PASS, count=" + count);

  console.log("\n[2] Select * from assets...");
  const { data, error: e2 } = await supabase.from("assets").select("*");
  console.log(e2 ? "FAIL: " + e2.message + " (" + e2.code + ")" : "PASS, rows=" + (data?.length ?? 0));
}

diagnose().catch(console.error);

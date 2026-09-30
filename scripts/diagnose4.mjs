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

async function diagnose() {
  const cookieStore = new Map();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() { return Array.from(cookieStore.values()); },
      setAll(items) { items.forEach(({ name, value, options }) => cookieStore.set(name, { name, value, options })); },
    },
  });

  // Test 1: head query
  console.log("[1] Head query on assets...");
  const { count, error: e1 } = await supabase.from("assets").select("*", { count: "exact", head: true });
  console.log(e1 ? "FAIL: " + e1.message : "PASS, count=" + count);

  // Test 2: select all
  console.log("[2] Select all from assets...");
  const { data: d2, error: e2 } = await supabase.from("assets").select("*");
  console.log(e2 ? "FAIL: " + e2.message + " CODE:" + e2.code : "PASS, rows=" + (d2?.length ?? 0));

  // Test 3: eq filter
  console.log("[3] eq filter on assets...");
  const { data: d3, error: e3 } = await supabase.from("assets").select("*").eq("id", "00000000-0000-0000-0000-000000000000");
  console.log(e3 ? "FAIL: " + e3.message + " CODE:" + e3.code : "PASS, rows=" + (d3?.length ?? 0));

  // Test 4: order by
  console.log("[4] order by on assets...");
  const { data: d4, error: e4 } = await supabase.from("assets").select("*").order("created_at", { ascending: false });
  console.log(e4 ? "FAIL: " + e4.message + " CODE:" + e4.code : "PASS, rows=" + (d4?.length ?? 0));

  // Test 5: eq + order
  console.log("[5] eq + order on assets...");
  const { data: d5, error: e5 } = await supabase.from("assets").select("*").eq("project_id", "b1805071-797a-4aa7-9bc4-199b0785440a").order("created_at", { ascending: false });
  console.log(e5 ? "FAIL: " + e5.message + " CODE:" + e5.code : "PASS, rows=" + (d5?.length ?? 0));
}

diagnose().catch(console.error);

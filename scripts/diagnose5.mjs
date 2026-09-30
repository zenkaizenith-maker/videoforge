import { createClient } from "@supabase/supabase-js";
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
  const anon = createClient(url, key);
  const cookieStore = new Map();
  const srv = createServerClient(url, key, {
    cookies: {
      getAll() { return Array.from(cookieStore.values()); },
      setAll(items) { items.forEach(({ name, value, options }) => cookieStore.set(name, { name, value, options })); },
    },
  });

  // Compare anon vs server client
  console.log("=== createClient (anon) ===");
  const r1 = await anon.from("assets").select("*").limit(1);
  console.log("select *:", r1.error ? "FAIL: " + r1.error.message + " (" + r1.error.code + ")" : "PASS");

  console.log("\n=== createServerClient ===");
  const r2 = await srv.from("assets").select("*").limit(1);
  console.log("select *:", r2.error ? "FAIL: " + r2.error.message + " (" + r2.error.code + ")" : "PASS");

  // Try using PostgREST directly
  console.log("\n=== Direct PostgREST ===");
  const postgrestUrl = `${url}/rest/v1/assets?select=*&limit=1`;
  const headers = {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
  };
  const resp = await fetch(postgrestUrl, { headers });
  console.log("Status:", resp.status);
  const body = await resp.text();
  console.log("Body:", body.slice(0, 200));
}

diagnose().catch(console.error);

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
const key = env.SUPABASE_SECRET_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function diagnose() {
  const supabase = createClient(url, key);

  // Try common raw-SQL RPC functions
  const funcs = ["query", "exec", "sql", "run_sql", "execute"];
  for (const fn of funcs) {
    console.log(`Trying rpc("${fn}")...`);
    const { data, error } = await supabase.rpc(fn, { query: "SELECT 1" });
    if (error) {
      console.log(`  FAIL: ${error.message} (${error.code})`);
    } else {
      console.log(`  PASS: ${JSON.stringify(data)}`);
      break;
    }
  }
}

diagnose().catch(console.error);

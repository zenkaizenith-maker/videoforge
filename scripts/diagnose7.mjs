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

  // Try information_schema
  console.log("[1] Checking information_schema.tables...");
  const { data: tables, error: tablesError } = await supabase
    .from("tables")
    .select("table_name")
    .eq("table_schema", "public")
    .eq("table_name", "assets");

  console.log(tablesError ? "FAIL: " + tablesError.message + " (" + tablesError.code + ")" : "PASS, tables=" + JSON.stringify(tables));

  // Try pg_catalog
  console.log("\n[2] Checking pg_catalog.pg_tables...");
  const { data: pgTables, error: pgError } = await supabase
    .from("pg_tables")
    .select("tablename")
    .eq("schemaname", "public")
    .eq("tablename", "assets");

  console.log(pgError ? "FAIL: " + pgError.message + " (" + pgError.code + ")" : "PASS, tables=" + JSON.stringify(pgTables));

  // Try direct PostgREST schema endpoint
  console.log("\n[3] Checking PostgREST schema endpoint...");
  const schemaUrl = `${url}/rest/v1/`;
  const resp = await fetch(schemaUrl, {
    headers: { "apikey": key, "Authorization": `Bearer ${key}` },
  });
  console.log("Status:", resp.status);
  const body = await resp.text();
  console.log("Body:", body.slice(0, 300));
}

diagnose().catch(console.error);

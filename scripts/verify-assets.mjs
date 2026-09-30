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

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function verify() {
  console.log("=== Supabase live verification ===\n");

  // 1. Check assets table
  console.log("[1] Checking public.assets table existence...");
  const { count, error: assetsError } = await supabase
    .from("assets")
    .select("*", { count: "exact", head: true });

  if (assetsError) {
    console.log("FAIL: assets table error:", assetsError.message);
    console.log("CODE:", assetsError.code);
  } else {
    console.log("PASS: assets table exists and is queryable. Count:", count ?? 0);
  }

  // 2. Check project-assets bucket
  console.log("\n[2] Checking project-assets storage bucket...");
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    console.log("FAIL: could not list buckets:", bucketsError.message);
  } else {
    const found = buckets.find((b) => b.name === "project-assets");
    if (found) {
      console.log("PASS: project-assets bucket exists. public:", found.public, "id:", found.id);
    } else {
      console.log("FAIL: project-assets bucket NOT found. Available buckets:", buckets.map((b) => b.name));
    }
  }

  // 3. Find an owned project
  console.log("\n[3] Finding an owned project...");
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    console.log("FAIL: could not get authenticated user:", authError?.message);
    return;
  }
  console.log("Authenticated as:", user.email);

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id,title,owner_id")
    .eq("owner_id", user.id)
    .limit(1);

  if (projectsError || !projects?.length) {
    console.log("FAIL: no owned projects found:", projectsError?.message);
    return;
  }

  const project = projects[0];
  console.log("PASS: using project:", project.id, project.title);

  // 4. Upload a test PNG
  console.log("\n[4] Uploading test asset...");
  const testPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const buffer = Buffer.from(testPngBase64, "base64");
  const testFile = new File([buffer], "videoforge-verify-test.png", { type: "image/png" });

  const objectPath = `${project.id}/${crypto.randomUUID()}.png`;
  const { error: uploadError } = await supabase.storage
    .from("project-assets")
    .upload(objectPath, testFile, { contentType: "image/png", upsert: false });

  if (uploadError) {
    console.log("FAIL: upload error:", uploadError.message);
  } else {
    console.log("PASS: uploaded to storage path:", objectPath);
  }

  // 5. Insert DB row
  console.log("\n[5] Inserting assets DB row...");
  const { data: inserted, error: insertError } = await supabase
    .from("assets")
    .insert({
      project_id: project.id,
      original_filename: testFile.name,
      storage_path: objectPath,
      media_type: "image",
      mime_type: "image/png",
      file_size: testFile.size,
      width: 1,
      height: 1,
      duration_seconds: null,
      assigned_scene_id: null,
    })
    .select("*")
    .single();

  if (insertError) {
    console.log("FAIL: insert error:", insertError.message, "CODE:", insertError.code);
  } else {
    console.log("PASS: inserted asset row:");
    console.log("  id:", inserted.id);
    console.log("  project_id:", inserted.project_id);
    console.log("  storage_path:", inserted.storage_path);
    console.log("  original_filename:", inserted.original_filename);
    console.log("  mime_type:", inserted.mime_type);
    console.log("  file_size:", inserted.file_size);
    console.log("  media_type:", inserted.media_type);
    console.log("  assigned_scene_id:", inserted.assigned_scene_id);
  }

  const assetId = inserted?.id;

  // 6. Generate signed URL
  console.log("\n[6] Generating signed preview URL...");
  if (assetId) {
    const { data: signedData, error: signedError } = await supabase.storage
      .from("project-assets")
      .createSignedUrl(objectPath, 3600);

    if (signedError || !signedData?.signedUrl) {
      console.log("FAIL: signed URL error:", signedError?.message);
    } else {
      console.log("PASS: signed URL generated (length:", signedData.signedUrl.length, ")");
      console.log("  starts with:", signedData.signedUrl.slice(0, 40) + "...");
    }
  }

  // 7. Verify row via select
  console.log("\n[7] Verifying row via select...");
  if (assetId) {
    const { data: verified, error: verifyError } = await supabase
      .from("assets")
      .select("*")
      .eq("id", assetId)
      .eq("project_id", project.id)
      .single();

    if (verifyError || !verified) {
      console.log("FAIL: verify error:", verifyError?.message);
    } else {
      console.log("PASS: row verified. media_type:", verified.media_type, "file_size:", verified.file_size);
    }
  }

  // 8. Delete asset row + storage object
  console.log("\n[8] Deleting asset row and storage object...");
  if (assetId) {
    const { error: deleteStorageError } = await supabase.storage.from("project-assets").remove([objectPath]);
    if (deleteStorageError) {
      console.log("FAIL: storage delete error:", deleteStorageError.message);
    } else {
      console.log("PASS: storage object removed");
    }

    const { error: deleteDbError } = await supabase
      .from("assets")
      .delete()
      .eq("id", assetId)
      .eq("project_id", project.id);

    if (deleteDbError) {
      console.log("FAIL: DB delete error:", deleteDbError.message);
    } else {
      console.log("PASS: DB row deleted");
    }

    // Verify gone
    const { data: gone } = await supabase
      .from("assets")
      .select("id")
      .eq("id", assetId)
      .eq("project_id", project.id)
      .maybeSingle();
    console.log("Post-delete select:", gone ? "still exists (FAIL)" : "gone (PASS)");
  }

  console.log("\n=== Verification complete ===");
}

verify().catch((err) => {
  console.error("Verification script error:", err.message);
  process.exit(1);
});

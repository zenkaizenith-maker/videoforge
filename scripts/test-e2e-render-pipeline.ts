import fs from "fs";
import path from "path";
import os from "os";
import { execFileSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import { probeVideo, renderComposition, executeRenderPipeline } from "../src/lib/video/ffmpeg-renderer";
import { generateSrtContent, generateVttContent } from "../src/lib/subtitles/types";
import { generatePublishMetadata } from "../src/lib/publish/generator";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const secretKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!;

if (!supabaseUrl || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });

async function runE2ETest() {
  console.log("\n=======================================================");
  console.log("   VIDEOFORGE COMPLETE END-TO-END RENDER PIPELINE TEST");
  console.log("=======================================================\n");

  let testProjectId: string | null = null;
  const createdStoragePaths: string[] = [];

  try {
    // STEP 1: Find or create owner user & project
    console.log("--- STEP 1: INITIALIZE TEST PROJECT ---");
    const { data: existingProjects } = await supabase.from("projects").select("owner_id").limit(1);
    let ownerId: string;
    if (existingProjects && existingProjects.length > 0 && existingProjects[0].owner_id) {
      ownerId = existingProjects[0].owner_id;
    } else {
      const { data: users, error: userError } = await supabase.auth.admin.listUsers({ perPage: 1 });
      if (userError || !users?.users?.length) {
        throw new Error("Could not find any user in Supabase Auth.");
      }
      ownerId = users.users[0].id;
    }
    console.log(`[PASS] Valid project owner found: ${ownerId}`);


    const projectTitle = `E2E Master Render Test ${Date.now()}`;
    const { data: projectData, error: projErr } = await supabase
      .from("projects")
      .insert({
        title: projectTitle,
        topic: "Autonomous AI Production Pipeline",
        owner_id: ownerId,
        status: "draft",
      })
      .select("*")
      .single();

    if (projErr || !projectData) {
      throw new Error(`Project creation failed: ${projErr?.message}`);
    }
    testProjectId = projectData.id;
    console.log(`[PASS] Created test project: ${testProjectId} ("${projectTitle}")`);

    // STEP 2: Create Script Document with Scenes
    console.log("\n--- STEP 2: CREATE SCRIPT DOCUMENT & SCENES ---");
    const scenes = [
      {
        id: `scene-1-${Date.now()}`,
        sequenceIndex: 1,
        title: "The Genesis of Intelligent Systems",
        narration: "From the earliest neural networks to self-assembling video workflows, creation has fundamentally shifted.",
        visualDirection: "Cinematic digital neural network nodes pulsing in deep cosmic blue.",
        estimatedDurationSeconds: 4,
      },
      {
        id: `scene-2-${Date.now()}`,
        sequenceIndex: 2,
        title: "Autonomous Video Composition",
        narration: "Every frame, audio ducking point, and subtitle cue is woven deterministically into a single master MP4.",
        visualDirection: "High-speed timeline assembling with glowing laser cuts.",
        estimatedDurationSeconds: 4,
      },
    ];

    const scriptDoc = {
      title: projectTitle,
      hook: "How does code transform into cinema?",
      scenes,
      compositionSettings: {
        aspectRatio: "16:9",
        resolution: "1080p",
        fps: 30,
        masterVolume: 100,
        musicDucking: true,
      },
      audioSettings: {},
      subtitles: {
        enabled: true,
        cues: [
          {
            id: "cue-1",
            sceneId: scenes[0].id,
            startTime: 0.5,
            endTime: 3.5,
            text: "From neural networks to self-assembling video workflows...",
          },
          {
            id: "cue-2",
            sceneId: scenes[1].id,
            startTime: 4.5,
            endTime: 7.5,
            text: "Every frame and subtitle cue is woven deterministically into MP4.",
          },
        ],
        style: {
          preset: "cinematic",
          fontSize: 22,
          fontFamily: "Inter, sans-serif",
          textColor: "#ffffff",
          backgroundColor: "rgba(0, 0, 0, 0.65)",
          highlightColor: "#38bdf8",
          position: "bottom",
          alignment: "center",
          textTransform: "none",
          shadow: true,
        },
      },
      renderJobs: [],
      publishMetadata: null,
    };

    const { error: scriptErr } = await supabase.from("scripts").insert({
      project_id: testProjectId,
      content: JSON.stringify(scriptDoc),
      version: 1,
    });
    if (scriptErr) throw new Error(`Script insert failed: ${scriptErr.message}`);
    console.log(`[PASS] Script document saved with ${scenes.length} scenes and composition settings.`);

    // STEP 3: Generate and Upload Visual Asset for Scene 1
    console.log("\n--- STEP 3: UPLOAD & ASSIGN VISUAL ASSET ---");
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-assets-"));
    const sampleImgPath = path.join(tmpDir, "scene1.png");

    // Use FFmpeg to generate a sample 1920x1080 test image
    const ffmpegPath = require("ffmpeg-static");
    execFileSync(ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x1e3a8a:s=1920x1080:d=1",
      "-vf",
      "drawtext=text='VideoForge AI Visual':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2",
      "-frames:v",
      "1",
      sampleImgPath,
    ]);

    const imgBuffer = fs.readFileSync(sampleImgPath);
    const imgStoragePath = `${testProjectId}/scene1_${Date.now()}.png`;
    createdStoragePaths.push(imgStoragePath);

    const { error: imgUpErr } = await supabase.storage
      .from("project-assets")
      .upload(imgStoragePath, imgBuffer, { contentType: "image/png", upsert: true });
    if (imgUpErr) throw new Error(`Visual upload failed: ${imgUpErr.message}`);

    const { data: assetData, error: assetErr } = await supabase
      .from("assets")
      .insert({
        project_id: testProjectId,
        original_filename: "scene1.png",
        storage_path: imgStoragePath,
        media_type: "image",
        mime_type: "image/png",
        file_size: imgBuffer.length,
        width: 1920,
        height: 1080,
        assigned_scene_id: scenes[0].id,
      })
      .select("*")
      .single();
    if (assetErr) throw new Error(`Asset record insert failed: ${assetErr.message}`);
    console.log(`[PASS] Uploaded visual asset to project-assets (${imgBuffer.length} bytes) and linked to Scene 1.`);

    // STEP 4: Generate and Upload Audio Asset
    console.log("\n--- STEP 4: UPLOAD & CONFIGURE AUDIO TRACK ---");
    const sampleAudioPath = path.join(tmpDir, "ambient.wav");
    execFileSync(ffmpegPath, [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=432:duration=8",
      sampleAudioPath,
    ]);

    const audioBuffer = fs.readFileSync(sampleAudioPath);
    const audioStoragePath = `${testProjectId}/ambient_${Date.now()}.wav`;
    createdStoragePaths.push(audioStoragePath);

    const { error: audioUpErr } = await supabase.storage
      .from("project-assets")
      .upload(audioStoragePath, audioBuffer, { contentType: "audio/wav", upsert: true });
    if (audioUpErr) throw new Error(`Audio upload failed: ${audioUpErr.message}`);

    const { data: audioAssetData, error: audioAssetErr } = await supabase
      .from("assets")
      .insert({
        project_id: testProjectId,
        original_filename: "ambient.wav",
        storage_path: audioStoragePath,
        media_type: "audio",
        mime_type: "audio/wav",
        file_size: audioBuffer.length,
        duration_seconds: 8,
      })
      .select("*")
      .single();
    if (audioAssetErr) throw new Error(`Audio record insert failed: ${audioAssetErr.message}`);

    // Update audioSettings in script document
    const updatedScriptDoc = {
      ...scriptDoc,
      audioSettings: {
        [audioAssetData.id]: {
          category: "music",
          volume: 25,
          isMuted: false,
          isLoop: true,
        },
      },
    };
    await supabase
      .from("scripts")
      .update({ content: JSON.stringify(updatedScriptDoc), updated_at: new Date().toISOString() })
      .eq("project_id", testProjectId);
    console.log(`[PASS] Uploaded audio asset to project-assets (${audioBuffer.length} bytes) and configured ducked soundtrack.`);

    // Cleanup local asset temp
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // STEP 5: Verify Subtitles Generation
    console.log("\n--- STEP 5: SUBTITLES VERIFICATION ---");
    const srt = generateSrtContent(scriptDoc.subtitles.cues);
    const vtt = generateVttContent(scriptDoc.subtitles.cues);
    if (!srt.includes("-->") || !vtt.includes("WEBVTT")) {
      throw new Error("Subtitle generation format validation failed.");
    }
    console.log(`[PASS] SRT and VTT captions formatted successfully:\n${srt.trim()}`);

    // STEP 6: Execute Real Video Render Pipeline
    console.log("\n--- STEP 6: TRIGGER REAL FFMPEG RENDER PIPELINE ---");
    const renderJobId = `job-${Date.now()}`;
    const initialJobRecord = {
      id: renderJobId,
      projectId: testProjectId,
      status: "processing",
      progress: 5,
      step: "analyzing_timeline",
      stepMessage: "Initializing composition engine...",
      resolution: "1080p",
      aspectRatio: "16:9",
      fps: 30,
      durationSeconds: 8,
      outputVideoUrl: null,
      outputFileSize: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    // Save job into script document
    const docWithJob = {
      ...updatedScriptDoc,
      renderJobs: [initialJobRecord],
    };
    await supabase
      .from("scripts")
      .update({ content: JSON.stringify(docWithJob), updated_at: new Date().toISOString() })
      .eq("project_id", testProjectId);

    console.log(`[INFO] Enqueued render job ${renderJobId}. Executing real FFmpeg pipeline...`);
    const renderStartTime = Date.now();
    await executeRenderPipeline(testProjectId!, renderJobId);
    const renderDurationMs = Date.now() - renderStartTime;

    console.log(`[PASS] FFmpeg render pipeline executed in ${(renderDurationMs / 1000).toFixed(1)}s.`);

    // STEP 7: Check Job Result in Database
    console.log("\n--- STEP 7: VERIFY RENDER STATUS & ARTIFACT METADATA ---");
    const { data: updatedScriptRow, error: checkErr } = await supabase
      .from("scripts")
      .select("content")
      .eq("project_id", testProjectId)
      .single();
    if (checkErr) throw new Error(`Could not read updated script row: ${checkErr.message}`);

    const parsedRow = JSON.parse(updatedScriptRow.content);
    const finalDoc = parsedRow.document || parsedRow;
    const completedJob = (finalDoc.renderJobs || []).find((j: { id: string }) => j.id === renderJobId);

    if (!completedJob) {
      throw new Error(`Job ${renderJobId} not found in script document.`);
    }

    if (completedJob.status !== "completed") {
      throw new Error(`Render job did not complete successfully. Status: ${completedJob.status}, Error: ${completedJob.errorMessage}`);
    }

    console.log(`[PASS] Job status is COMPLETED with progress: ${completedJob.progress}%`);
    console.log(`[PASS] Output Video URL: ${completedJob.outputVideoUrl ? completedJob.outputVideoUrl.slice(0, 80) + "..." : "NULL"}`);
    console.log(`[PASS] Output File Size: ${(completedJob.outputFileSize / 1024).toFixed(1)} KB`);

    // STEP 8: Verify Output MP4 with FFprobe
    console.log("\n--- STEP 8: PROBE RENDERED MP4 WITH FFPROBE ---");
    const renderStoragePath = `${testProjectId}/renders/${renderJobId}.mp4`;
    createdStoragePaths.push(renderStoragePath);

    // Download rendered MP4 to temp file
    const { data: mp4Data, error: mp4DownErr } = await supabase.storage
      .from("project-assets")
      .download(renderStoragePath);
    if (mp4DownErr || !mp4Data) {
      throw new Error(`Rendered MP4 file not found in storage: ${mp4DownErr?.message}`);
    }

    const testMp4Path = path.join(os.tmpdir(), `verify-${renderJobId}.mp4`);
    fs.writeFileSync(testMp4Path, Buffer.from(await mp4Data.arrayBuffer()));

    const probe = await probeVideo(testMp4Path);
    console.log(`[PASS] MP4 verified by ffprobe:`);
    console.log(`       Resolution: ${probe.width}x${probe.height}`);
    console.log(`       Duration: ${probe.durationSeconds.toFixed(2)} seconds (Target: 8.00s)`);
    console.log(`       Video Codec: ${probe.codec}`);
    console.log(`       Audio Codec: ${probe.audioCodec || "none"}`);

    if (probe.width !== 1920 || probe.height !== 1080) {
      throw new Error(`Unexpected resolution: ${probe.width}x${probe.height}, expected 1920x1080.`);
    }
    if (probe.codec !== "h264") {
      throw new Error(`Unexpected video codec: ${probe.codec}, expected h264.`);
    }
    if (!probe.audioCodec || !probe.audioCodec.includes("aac")) {
      throw new Error(`Unexpected audio codec: ${probe.audioCodec}, expected aac.`);
    }
    if (probe.durationSeconds < 7.0) {
      throw new Error(`Rendered video runtime too short: ${probe.durationSeconds}s, expected ~8s.`);
    }
    fs.unlinkSync(testMp4Path);
    console.log("[PASS] Output MP4 passed all strict audio/video validation checks!");

    // STEP 9: Verify Publish Studio Metadata & Distribution Package
    console.log("\n--- STEP 9: VERIFY PUBLISH & DISTRIBUTION PACKAGE ---");
    const publishMeta = generatePublishMetadata(projectTitle, scriptDoc.hook, scenes);
    if (!publishMeta.title || !publishMeta.description || publishMeta.chapters.length !== 2) {
      throw new Error("Publish metadata generation failed.");
    }

    console.log(`[PASS] Generated YouTube Title: "${publishMeta.title}"`);
    console.log(`[PASS] Generated ${publishMeta.chapters.length} chapter markers:`);
    publishMeta.chapters.forEach((c) => console.log(`       ${c.formattedTime} - ${c.title}`));
    console.log(`[PASS] Generated ${publishMeta.tags.length} SEO tags: [${publishMeta.tags.join(", ")}]`);

    // STEP 10: Clean up test artifacts from storage & database
    console.log("\n--- STEP 10: CLEAN UP TEST ASSETS ---");
    if (createdStoragePaths.length > 0) {
      const { error: rmErr } = await supabase.storage.from("project-assets").remove(createdStoragePaths);
      if (rmErr) console.warn("Could not delete test files from storage:", rmErr.message);
      else console.log(`[PASS] Removed ${createdStoragePaths.length} test assets from Supabase Storage.`);
    }

    await supabase.from("projects").delete().eq("id", testProjectId);
    console.log(`[PASS] Cleaned up temporary test project ${testProjectId}.`);

    console.log("\n=======================================================");
    console.log("   🎉 ALL 10 E2E RENDER PIPELINE CHECKS PASSED 100%!");
    console.log("=======================================================\n");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("\n❌ [E2E TEST FAILURE]:", msg);

    // Attempt cleanup on failure
    if (createdStoragePaths.length > 0) {
      try {
        await supabase.storage.from("project-assets").remove(createdStoragePaths);
      } catch {}
    }
    if (testProjectId) {
      try {
        await supabase.from("projects").delete().eq("id", testProjectId);
      } catch {}
    }
    process.exit(1);
  }

}

void runE2ETest();

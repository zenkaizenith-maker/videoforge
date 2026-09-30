import fs from "fs";
import path from "path";
import { renderComposition } from "../src/lib/video/ffmpeg-renderer";

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


async function testAspectRatios() {
  console.log("=== TESTING REAL COMPOSITION IN 16:9, 9:16, AND 1:1 ===");

  // 1. Test 16:9 (Landscape)
  console.log("\n1. Rendering 16:9 Landscape Composition...");
  const res169 = await renderComposition({
    projectId: "aspect-test",
    jobId: `test-169-${Date.now()}`,
    scenes: [
      {
        sceneId: "s1",
        title: "Landscape Scene",
        narration: "Testing 16 by 9",
        visualDirection: "wide",
        durationSeconds: 2,
        transition: "fade",
        transitionDurationSeconds: 0.5,
        motionEffect: "zoom-in",
      },
    ],
    audioTracks: [],
    settings: {
      aspectRatio: "16:9",
      resolution: "1080p",
      fps: 30,
      masterVolume: 100,
      musicDucking: true,
    },
  });
  console.log(`[PASS] 16:9 Rendered: ${res169.probe.width}x${res169.probe.height}, Duration: ${res169.probe.durationSeconds}s, Codec: ${res169.probe.codec}, Audio: ${res169.probe.audioCodec}`);
  if (res169.probe.width !== 1920 || res169.probe.height !== 1080) {
    throw new Error(`Expected 1920x1080, got ${res169.probe.width}x${res169.probe.height}`);
  }

  // 2. Test 9:16 (Vertical Shorts / Reels)
  console.log("\n2. Rendering 9:16 Vertical Composition...");
  const res916 = await renderComposition({
    projectId: "aspect-test",
    jobId: `test-916-${Date.now()}`,
    scenes: [
      {
        sceneId: "s1",
        title: "Vertical Story Scene",
        narration: "Testing 9 by 16",
        visualDirection: "tall",
        durationSeconds: 2,
        transition: "fade",
        transitionDurationSeconds: 0.5,
        motionEffect: "zoom-in",
      },
    ],
    audioTracks: [],
    settings: {
      aspectRatio: "9:16",
      resolution: "1080p",
      fps: 30,
      masterVolume: 100,
      musicDucking: true,
    },
  });
  console.log(`[PASS] 9:16 Rendered: ${res916.probe.width}x${res916.probe.height}, Duration: ${res916.probe.durationSeconds}s, Codec: ${res916.probe.codec}, Audio: ${res916.probe.audioCodec}`);
  if (res916.probe.width !== 1080 || res916.probe.height !== 1920) {
    throw new Error(`Expected 1080x1920, got ${res916.probe.width}x${res916.probe.height}`);
  }

  // 3. Test 1:1 (Square Feed)
  console.log("\n3. Rendering 1:1 Square Composition...");
  const res11 = await renderComposition({
    projectId: "aspect-test",
    jobId: `test-11-${Date.now()}`,
    scenes: [
      {
        sceneId: "s1",
        title: "Square Post Scene",
        narration: "Testing 1 by 1",
        visualDirection: "square",
        durationSeconds: 2,
        transition: "cut",
        transitionDurationSeconds: 0.5,
        motionEffect: "pan-left",
      },
    ],
    audioTracks: [],
    settings: {
      aspectRatio: "1:1",
      resolution: "1080p",
      fps: 30,
      masterVolume: 100,
      musicDucking: true,
    },
  });
  console.log(`[PASS] 1:1 Rendered: ${res11.probe.width}x${res11.probe.height}, Duration: ${res11.probe.durationSeconds}s, Codec: ${res11.probe.codec}, Audio: ${res11.probe.audioCodec}`);
  if (res11.probe.width !== 1080 || res11.probe.height !== 1080) {
    throw new Error(`Expected 1080x1080, got ${res11.probe.width}x${res11.probe.height}`);
  }

  console.log("\n🎉 ALL 3 ASPECT RATIOS (16:9, 9:16, 1:1) VERIFIED BY FFPROBE!");
}

void testAspectRatios().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createServiceRoleClient } from "@/lib/supabase/server-service-role";
import {
  downloadAssetBuffer,
  uploadAssetBuffer,
  createAssetSignedUrl,
} from "@/lib/storage/supabase-storage-client";
import { loadScriptRecordServiceRole } from "@/lib/scripts/script-repository";
import { updateRenderJobProgressServiceRole } from "@/lib/render/render-repository";
import { generateSrtContent } from "@/lib/subtitles/types";
import type { VideoProbe } from "./contracts";
import type {
  AspectRatio,
  CompositionSettings,
  MotionEffect,
  TransitionType,
  VideoResolution,
} from "@/lib/editor/types";
import type { AudioCategory } from "@/lib/audio/types";
import type { SubtitleCue, SubtitleStyle } from "@/lib/subtitles/types";
import type { RenderStep } from "@/lib/render/types";

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

// Active running child processes by jobId for cancellation
const activeJobs = new Map<string, { abort: () => void }>();

export function getFfmpegBinary(): string {
  try {
    const ffmpegPkg = require("ffmpeg-static");
    const ffmpegPath = typeof ffmpegPkg === "string" ? ffmpegPkg : (ffmpegPkg?.default ?? ffmpegPkg);
    if (ffmpegPath && typeof ffmpegPath === "string" && fs.existsSync(ffmpegPath)) {
      return ffmpegPath;
    }
  } catch {
    // Fallback to system PATH
  }
  return "ffmpeg";
}

export function getFfprobeBinary(): string {
  try {
    const ffprobe = require("ffprobe-static");
    const probePath = ffprobe?.path || (typeof ffprobe === "string" ? ffprobe : null);
    if (probePath && fs.existsSync(probePath)) {
      return probePath;
    }
  } catch {
    // Fallback to system PATH
  }
  return "ffprobe";
}


export async function probeVideo(filePath: string): Promise<VideoProbe> {
  const ffprobePath = getFfprobeBinary();
  const { stdout } = await execFileAsync(ffprobePath, [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    filePath,
  ]);

  const data = JSON.parse(stdout);
  const streams = (data.streams as Array<Record<string, unknown>>) || [];
  const videoStream = streams.find((s) => s.codec_type === "video");
  const audioStream = streams.find((s) => s.codec_type === "audio");

  const durationStr =
    (data.format?.duration as string) ||
    (videoStream?.duration as string) ||
    "0";
  const durationSeconds = parseFloat(durationStr) || 0;
  const width = (videoStream?.width as number) || 0;
  const height = (videoStream?.height as number) || 0;
  const codec = (videoStream?.codec_name as string) || "unknown";
  const audioCodec = (audioStream?.codec_name as string) || undefined;
  const fileSize = data.format?.size ? parseInt(data.format.size as string, 10) : undefined;

  return {
    durationSeconds,
    width,
    height,
    codec,
    audioCodec,
    fileSize,
  };
}

export function getResolutionDimensions(
  resolution: VideoResolution,
  aspectRatio: AspectRatio,
): { width: number; height: number } {
  if (aspectRatio === "9:16") {
    switch (resolution) {
      case "720p":
        return { width: 720, height: 1280 };
      case "4k":
        return { width: 2160, height: 3840 };
      case "1080p":
      default:
        return { width: 1080, height: 1920 };
    }
  }
  if (aspectRatio === "1:1") {
    switch (resolution) {
      case "720p":
        return { width: 720, height: 720 };
      case "4k":
        return { width: 2160, height: 2160 };
      case "1080p":
      default:
        return { width: 1080, height: 1080 };
    }
  }
  // 16:9
  switch (resolution) {
    case "720p":
      return { width: 1280, height: 720 };
    case "4k":
      return { width: 3840, height: 2160 };
    case "1080p":
    default:
      return { width: 1920, height: 1080 };
  }
}

export interface RenderSceneInput {
  sceneId: string;
  title: string;
  narration: string;
  visualDirection: string;
  durationSeconds: number;
  assetStoragePath?: string | null;
  assetMediaType?: "image" | "video" | null;
  transition: TransitionType;
  transitionDurationSeconds: number;
  motionEffect: MotionEffect;
}

export interface RenderAudioInput {
  id: string;
  category: AudioCategory;
  storagePath: string;
  volume: number; // 0 - 100
  isMuted: boolean;
  isLoop: boolean;
}

export interface RenderCompositionParams {
  projectId: string;
  jobId: string;
  scenes: RenderSceneInput[];
  audioTracks: RenderAudioInput[];
  subtitles?: {
    enabled: boolean;
    cues: SubtitleCue[];
    style?: SubtitleStyle;
  } | null;
  settings: CompositionSettings;
  onProgress?: (step: RenderStep, progress: number, message: string) => Promise<void> | void;
}

export interface RenderCompositionResult {
  outputPath: string;
  storagePath: string;
  signedUrl: string;
  fileSize: number;
  probe: VideoProbe;
}

/**
 * Creates a real playable MP4 video composition using FFmpeg.
 */
export async function renderComposition(
  params: RenderCompositionParams,
): Promise<RenderCompositionResult> {
  const { projectId, jobId, scenes, audioTracks, subtitles, settings, onProgress } = params;
  const ffmpegPath = getFfmpegBinary();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `videoforge-render-${jobId}-`));

  let cancelled = false;
  activeJobs.set(jobId, {
    abort: () => {
      cancelled = true;
    },
  });

  const checkCancelled = () => {
    if (cancelled) {
      throw new Error("Render job was cancelled by user.");
    }
  };

  try {
    const { width, height } = getResolutionDimensions(settings.resolution, settings.aspectRatio);
    const fps = settings.fps || 30;

    await onProgress?.("analyzing_timeline", 15, "Analyzing scene cuts, visuals, and audio tracks…");
    checkCancelled();

    // 1. Prepare visual assets for each scene
    const clipFileNames: string[] = [];

    for (let i = 0; i < scenes.length; i++) {
      checkCancelled();
      const scene = scenes[i];
      const sceneDuration = Math.max(1, scene.durationSeconds || 5);
      const clipFileName = `clip_${i}.mp4`;
      clipFileNames.push(clipFileName);

      let visualInputPath: string | null = null;
      let isVideoAsset = false;

      if (scene.assetStoragePath) {
        try {
          const buffer = await downloadAssetBuffer(scene.assetStoragePath);
          const ext = path.extname(scene.assetStoragePath) || (scene.assetMediaType === "video" ? ".mp4" : ".png");
          const localAssetName = `asset_${i}${ext}`;
          fs.writeFileSync(path.join(tmpDir, localAssetName), buffer);
          visualInputPath = localAssetName;
          isVideoAsset = scene.assetMediaType === "video" || ext.match(/\.(mp4|mov|webm)$/i) !== null;
        } catch (downloadErr) {
          console.warn(`[FFmpeg] Could not download asset for scene ${i + 1}, fallback to title card:`, downloadErr);
        }
      }

      // If no asset or download failed, generate a clean high-contrast scene card
      if (!visualInputPath) {
        const slateFileName = `slate_${i}.png`;
        const safeTitle = (scene.title || `Scene ${i + 1}`).replace(/['"\\]/g, "");
        const bgColors = ["0x0f172a", "0x111827", "0x18181b", "0x090d16"];
        const bgColor = bgColors[i % bgColors.length];

        await execFileAsync(
          ffmpegPath,
          [
            "-y",
            "-f",
            "lavfi",
            "-i",
            `color=c=${bgColor}:s=${width}x${height}:d=1`,
            "-vf",
            `drawtext=text='Scene ${i + 1}':fontcolor=0x38bdf8:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=text='${safeTitle}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2+30`,
            "-frames:v",
            "1",
            slateFileName,
          ],
          { cwd: tmpDir },
        );
        visualInputPath = slateFileName;
        isVideoAsset = false;
      }

      // Build video clip for this scene
      const frames = Math.round(fps * sceneDuration);
      const videoFilters: string[] = [];

      if (isVideoAsset) {
        // Trim or loop video asset to scene duration and scale to fit
        videoFilters.push(
          `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
          `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
          `fps=${fps}`,
        );
      } else {
        // Image asset with camera motion
        switch (scene.motionEffect) {
          case "zoom-in":
            videoFilters.push(
              `zoompan=z='min(zoom+0.0012,1.2)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`,
            );
            break;
          case "zoom-out":
            videoFilters.push(
              `zoompan=z='if(lte(zoom,1.0),1.2,max(1.001,zoom-0.0012))':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`,
            );
            break;
          case "pan-left":
            videoFilters.push(
              `zoompan=z=1.12:d=${frames}:x='if(lte(on,-1),(iw-iw/zoom),max(0,x-2))':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`,
            );
            break;
          case "pan-right":
            videoFilters.push(
              `zoompan=z=1.12:d=${frames}:x='if(lte(on,-1),0,min(iw-iw/zoom,x+2))':y='ih/2-(ih/zoom/2)':s=${width}x${height}:fps=${fps}`,
            );
            break;
          case "none":
          default:
            videoFilters.push(
              `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
              `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
              `fps=${fps}`,
            );
            break;
        }
      }

      // Add transition effects (fade / dissolve)
      if (scene.transition === "fade" || scene.transition === "dissolve") {
        const fadeDuration = Math.min(0.6, sceneDuration / 3);
        const fadeOutStart = Math.max(0, sceneDuration - fadeDuration);
        videoFilters.push(
          `fade=t=in:st=0:d=${fadeDuration.toFixed(2)}`,
          `fade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeDuration.toFixed(2)}`,
        );
      }

      const clipArgs: string[] = ["-y"];
      if (!isVideoAsset) {
        clipArgs.push("-loop", "1", "-i", visualInputPath, "-t", String(sceneDuration));
      } else {
        clipArgs.push("-i", visualInputPath, "-t", String(sceneDuration));
      }

      clipArgs.push(
        "-vf",
        videoFilters.join(","),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "ultrafast",
        "-r",
        String(fps),
        "-an",
        clipFileName,
      );

      await execFileAsync(ffmpegPath, clipArgs, { cwd: tmpDir });
    }

    await onProgress?.("rendering_visuals", 55, "Joining scene clips and transitions into master timeline…");
    checkCancelled();

    // 2. Concatenate scene video clips
    const concatListFile = "concat_list.txt";
    const concatContent = clipFileNames.map((fn) => `file '${fn}'`).join("\n");
    fs.writeFileSync(path.join(tmpDir, concatListFile), concatContent);

    const mergedVideoFile = "visuals_combined.mp4";
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListFile,
        "-c",
        "copy",
        mergedVideoFile,
      ],
      { cwd: tmpDir },
    );

    // Get total video runtime
    const videoProbeData = await probeVideo(path.join(tmpDir, mergedVideoFile));
    const totalRuntimeSeconds = Math.max(1, videoProbeData.durationSeconds);

    await onProgress?.("mixing_audio", 70, "Synthesizing voiceover, background music, and audio ducking…");
    checkCancelled();

    // 3. Audio track processing and multi-track mixing
    const activeAudioTracks = audioTracks.filter((t) => !t.isMuted);
    let finalAudioInputArgs: string[] = [];

    if (activeAudioTracks.length > 0) {
      const audioInputs: string[] = [];
      const filterChains: string[] = [];
      const mixInputs: string[] = [];

      for (let i = 0; i < activeAudioTracks.length; i++) {
        const track = activeAudioTracks[i];
        try {
          const buf = await downloadAssetBuffer(track.storagePath);
          const ext = path.extname(track.storagePath) || ".mp3";
          const localAudioName = `audio_${i}${ext}`;
          fs.writeFileSync(path.join(tmpDir, localAudioName), buf);

          audioInputs.push("-i", localAudioName);

          let vol = (track.volume || 100) / 100;
          // Apply ducking to music if voiceover/narration is also present
          if (
            settings.musicDucking &&
            track.category === "music" &&
            activeAudioTracks.some((t) => t.category === "narration")
          ) {
            vol = Math.min(vol, 0.18);
          }

          let filterChain = `[${i}:a]volume=${vol.toFixed(2)}`;
          if (track.isLoop) {
            filterChain += `,aloop=loop=-1:size=2e+09`;
          }
          filterChain += `[a${i}]`;

          filterChains.push(filterChain);
          mixInputs.push(`[a${i}]`);
        } catch (audioErr) {
          console.warn(`[FFmpeg] Could not download audio track ${track.id}:`, audioErr);
        }
      }

      if (mixInputs.length > 0) {
        const filterComplex = `${filterChains.join(";")};${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=2[aout]`;
        const mixedAudioFile = "mixed_audio.wav";

        await execFileAsync(
          ffmpegPath,
          [
            "-y",
            ...audioInputs,
            "-filter_complex",
            filterComplex,
            "-map",
            "[aout]",
            "-t",
            String(totalRuntimeSeconds),
            mixedAudioFile,
          ],
          { cwd: tmpDir },
        );
        finalAudioInputArgs = ["-i", mixedAudioFile];
      }
    }

    // If no valid audio tracks, generate a clean silent stereo AAC track
    if (finalAudioInputArgs.length === 0) {
      finalAudioInputArgs = [
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=44100:cl=stereo`,
      ];
    }

    // 4. Subtitles burn-in
    let burnSubtitles = false;
    if (subtitles?.enabled && subtitles.cues?.length > 0) {
      await onProgress?.("baking_subtitles", 85, "Baking synchronized captions and subtitle overlays…");
      checkCancelled();

      const srtContent = generateSrtContent(subtitles.cues);
      fs.writeFileSync(path.join(tmpDir, "subtitles.srt"), srtContent, "utf8");
      burnSubtitles = true;
    }

    await onProgress?.("encoding_mp4", 92, "Encoding master MP4 with H.264 video and AAC audio…");
    checkCancelled();

    // 5. Final multiplex into master MP4
    const finalMasterFile = "master.mp4";
    const finalMuxArgs: string[] = [
      "-y",
      "-i",
      mergedVideoFile,
      ...finalAudioInputArgs,
    ];

    if (burnSubtitles) {
      finalMuxArgs.push(
        "-vf",
        "subtitles=subtitles.srt",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-crf",
        "22",
      );
    } else {
      finalMuxArgs.push("-c:v", "copy");
    }

    finalMuxArgs.push(
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      String(totalRuntimeSeconds),
      "-movflags",
      "+faststart",
      finalMasterFile,
    );

    await execFileAsync(ffmpegPath, finalMuxArgs, { cwd: tmpDir });

    // 6. Probe the final rendered MP4
    const finalMp4Path = path.join(tmpDir, finalMasterFile);
    const probe = await probeVideo(finalMp4Path);
    const stats = fs.statSync(finalMp4Path);
    const finalFileSize = stats.size;

    await onProgress?.("finalizing", 98, "Uploading rendered master video to secure storage…");
    checkCancelled();

    // 7. Upload to Supabase Storage: project-assets bucket
    const storagePath = `${projectId}/renders/${jobId}.mp4`;
    const buffer = fs.readFileSync(finalMp4Path);
    await uploadAssetBuffer(storagePath, buffer, "video/mp4");

    // 8. Generate a 24-hour signed URL for playback/download
    const signedUrl = await createAssetSignedUrl(storagePath, 86400);

    return {
      outputPath: finalMp4Path,
      storagePath,
      signedUrl,
      fileSize: finalFileSize,
      probe,
    };
  } finally {
    activeJobs.delete(jobId);
    // Cleanup temporary directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

export function cancelActiveRenderJob(jobId: string): boolean {
  const job = activeJobs.get(jobId);
  if (job) {
    job.abort();
    activeJobs.delete(jobId);
    return true;
  }
  return false;
}

/**
 * High-level orchestration that reads project data, calls renderComposition,
 * updates the renderJobs record in scripts.content, and marks it completed or failed.
 */
export async function executeRenderPipeline(projectId: string, jobId: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient();

    // 1. Fetch script document
    const scriptRecord = await loadScriptRecordServiceRole(projectId);
    const doc = scriptRecord.document;

    const scenes = doc.scenes || [];
    if (scenes.length === 0) {
      throw new Error("Project has no scenes to render.");
    }

    // 2. Fetch project assets (visuals and audio)
    const { data: assetRows } = await supabase
      .from("assets")
      .select("*")
      .eq("project_id", projectId);

    const assets = (assetRows as Array<Record<string, unknown>>) || [];

    // 3. Map scenes to RenderSceneInput
    const sceneInputs: RenderSceneInput[] = scenes.map((s, idx) => {
      const assignedAsset = assets.find(
        (a) =>
          a.assigned_scene_id === s.id &&
          (a.media_type === "image" || a.media_type === "video"),
      );

      return {
        sceneId: s.id,
        title: s.title || `Scene ${idx + 1}`,
        narration: s.narration || "",
        visualDirection: s.visualDirection || "",
        durationSeconds: s.estimatedDurationSeconds || 5,
        assetStoragePath: (assignedAsset?.storage_path as string) || null,
        assetMediaType: (assignedAsset?.media_type as "image" | "video") || null,
        transition: "fade",
        transitionDurationSeconds: 0.5,
        motionEffect: "zoom-in",
      };
    });


    // 4. Map audio assets to RenderAudioInput
    const audioSettingsMap = doc.audioSettings || {};
    const audioInputs: RenderAudioInput[] = assets
      .filter((a) => a.media_type === "audio")
      .map((a) => {
        const id = a.id as string;
        const settings = audioSettingsMap[id];
        return {
          id,
          category: (settings?.category as AudioCategory) || "music",
          storagePath: a.storage_path as string,
          volume: settings?.volume ?? 75,
          isMuted: settings?.isMuted ?? false,
          isLoop: settings?.isLoop ?? true,
        };
      });

    // 5. Composition settings & Subtitles
    const compositionSettings: CompositionSettings = doc.compositionSettings || {
      aspectRatio: "16:9",
      resolution: "1080p",
      fps: 30,
      masterVolume: 100,
      musicDucking: true,
    };

    const subtitles = doc.subtitles;

    // 6. Execute FFmpeg render composition
    const result = await renderComposition({
      projectId,
      jobId,
      scenes: sceneInputs,
      audioTracks: audioInputs,
      subtitles,
      settings: compositionSettings,
      onProgress: async (step, progress, message) => {
        await updateRenderJobProgressServiceRole({
          projectId,
          jobId,
          step,
          progress,
          stepMessage: message,
        });
      },
    });

    // 7. Mark render job complete with real signed URL and file size
    await updateRenderJobProgressServiceRole({
      projectId,
      jobId,
      step: "completed",
      progress: 100,
      stepMessage: "Master production video rendered and ready for distribution!",
      outputVideoUrl: result.signedUrl,
      outputFileSize: result.fileSize,
      isComplete: true,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[FFmpeg] Render pipeline failed for job ${jobId}:`, err);

    await updateRenderJobProgressServiceRole({
      projectId,
      jobId,
      step: "failed",
      progress: 0,
      stepMessage: `Render failed: ${errorMsg}`,
      errorMessage: errorMsg,
    });
  }
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { saveSettings, updateClip } from "@/app/projects/[id]/editor/actions";
import {
  formatEditorClock,
  type AspectRatio,
  type CompositionSettings,
  type EditorSceneClip,
  type EditorWorkspaceData,
  type MotionEffect,
  type TransitionType,
  type VideoResolution,
} from "@/lib/editor/types";

interface EditorStudioProps {
  initialWorkspace: EditorWorkspaceData;
}

const STAGES = [
  ["Script", "script"],
  ["Scenes", "scenes"],
  ["Assets", "assets"],
  ["Audio", "audio"],
  ["Subtitles", "subtitles"],
  ["Editor", "editor"],
  ["Render", "render"],
  ["Publish", "publish"],
] as const;

export function EditorStudio({ initialWorkspace }: EditorStudioProps) {
  const { projectId, projectTitle, availableAssets } = initialWorkspace;

  const [clips, setClips] = useState<EditorSceneClip[]>(initialWorkspace.clips);
  const [settings, setSettings] = useState<CompositionSettings>(initialWorkspace.settings);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    initialWorkspace.clips[0]?.id ?? "",
  );

  // Scrubber playback
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Feedback
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  }, []);

  // Compute timeline layout and boundaries
  const timelineClips = useMemo(() => {
    const list: (EditorSceneClip & { timelineStart: number; timelineEnd: number })[] = [];
    let accum = 0;
    for (const clip of clips) {
      const start = accum;
      const end = accum + clip.durationSeconds;
      accum = end;
      list.push({
        ...clip,
        timelineStart: start,
        timelineEnd: end,
      });
    }
    return list;
  }, [clips]);

  const totalDuration = useMemo(() => {
    return timelineClips.length > 0
      ? timelineClips[timelineClips.length - 1].timelineEnd
      : 0;
  }, [timelineClips]);

  // Derive currently playing/displayed scene clip from currentTime
  const activeClip = useMemo(() => {
    const found = timelineClips.find(
      (c) => currentTime >= c.timelineStart && currentTime < c.timelineEnd,
    );
    return found || timelineClips[timelineClips.length - 1] || null;
  }, [timelineClips, currentTime]);

  // Selected clip in properties inspector
  const selectedClip = useMemo(() => {
    return clips.find((c) => c.id === selectedSceneId) || clips[0] || null;
  }, [clips, selectedSceneId]);

  // Playhead scrubber loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return Number((prev + 0.1).toFixed(1));
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, totalDuration]);

  // Handle clip property change
  async function handleUpdateSelectedClip(
    updates: Partial<{
      durationSeconds: number;
      transition: TransitionType;
      transitionDurationSeconds: number;
      motionEffect: MotionEffect;
      assignedAssetId: string | null;
    }>,
  ) {
    if (!selectedClip) return;

    // Optimistic UI update
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== selectedClip.id) return c;
        const assignedAsset =
          updates.assignedAssetId !== undefined
            ? availableAssets.find((a) => a.id === updates.assignedAssetId)
            : undefined;

        return {
          ...c,
          ...updates,
          assignedAssetUrl:
            assignedAsset !== undefined ? assignedAsset?.signedUrl ?? null : c.assignedAssetUrl,
          assignedAssetType:
            assignedAsset !== undefined ? assignedAsset?.mediaType ?? null : c.assignedAssetType,
        };
      }),
    );

    const result = await updateClip({
      projectId,
      sceneId: selectedClip.id,
      ...updates,
    });

    if (!result.ok) {
      setError(result.error);
    } else {
      flash("Clip properties updated.");
    }
  }

  // Handle composition settings change
  async function handleSaveSettings(newSettings: Partial<CompositionSettings>) {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    const result = await saveSettings({
      projectId,
      settings: updated,
    });

    if (!result.ok) {
      setError(result.error);
    } else {
      flash("Composition settings updated.");
    }
  }

  // Visual coverage
  const visualCount = clips.filter((c) => c.assignedAssetUrl).length;

  // Aspect ratio CSS box
  const aspectClass =
    settings.aspectRatio === "9:16" ? "9 / 16" : settings.aspectRatio === "1:1" ? "1 / 1" : "16 / 9";

  // Motion CSS effect
  const motionStyle = useMemo(() => {
    const effect = activeClip?.motionEffect || "none";
    if (effect === "zoom-in") return "scale(1.08)";
    if (effect === "zoom-out") return "scale(0.96)";
    if (effect === "pan-left") return "translateX(-4%)";
    if (effect === "pan-right") return "translateX(4%)";
    return "none";
  }, [activeClip]);

  return (
    <div className="studio">
      {/* Studio Header */}
      <header className="studio-head">
        <div>
          <nav className="studio-breadcrumb" aria-label="Breadcrumb">
            <Link href="/projects">Projects</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/projects/${projectId}`}>{projectTitle}</Link>
            <span aria-hidden="true">/</span>
            <strong>Editor</strong>
          </nav>
          <h1>Video Editor</h1>
          <p className="subtle">
            Arrange scenes, configure visual transitions, and master the full video composition.
          </p>
        </div>

        <div className="studio-head-actions">
          <Link href={`/projects/${projectId}/render`}>
            <Button type="button">
              Proceed to Render 🎬
            </Button>
          </Link>
        </div>
      </header>

      {/* Alerts */}
      {error && (
        <Alert tone="danger" title="Something went wrong">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="warning" title="Editor Updated">
          {notice}
        </Alert>
      )}

      {/* Production Stages Bar */}
      <nav className="studio-stages" aria-label="Production stages">
        {STAGES.map(([label, href]) => {
          const isActive = label === "Editor";
          const isAccessible = true;
          const projectHref =
            href === "script"
              ? `/projects/${projectId}/script`
              : `/projects/${projectId}/${href}`;

          if (isAccessible) {
            return (
              <Link
                key={label}
                href={projectHref}
                className={`studio-stage ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                {label}
              </Link>
            );
          }
          return (
            <span
              key={label}
              className={`studio-stage ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {label}
            </span>
          );
        })}
      </nav>

      {/* Studio Metrics */}
      <section className="studio-metrics" aria-label="Timeline composition statistics">
        <div className="studio-metric">
          <span>Total Runtime</span>
          <strong>{formatEditorClock(totalDuration)}</strong>
        </div>
        <div className="studio-metric">
          <span>Scenes in Sequence</span>
          <strong>{String(clips.length).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Visual Coverage</span>
          <strong style={{ color: visualCount === clips.length ? "var(--success)" : "var(--brand)" }}>
            {visualCount} / {clips.length}
          </strong>
        </div>
        <div className="studio-metric">
          <span>Output Format</span>
          <strong style={{ fontSize: "14px" }}>
            {settings.aspectRatio} • {settings.resolution}
          </strong>
        </div>
        <div className="studio-metric">
          <span>Frame Rate</span>
          <strong style={{ fontSize: "15px" }}>{settings.fps} FPS</strong>
        </div>
      </section>

      {/* Two Column Layout: Visual Canvas Preview (Left) & Clip Property Inspector (Right) */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 1.4fr) minmax(300px, 1fr)", gap: "20px", alignItems: "start" }}>
        {/* Left Column: Live Master Canvas Preview */}
        <div className="panel" style={{ padding: "18px", borderRadius: "14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <span className="studio-overline">Master Video Monitor</span>
            {/* Aspect Ratio & Format Toggles */}
            <div style={{ display: "flex", gap: "6px" }}>
              {(["16:9", "9:16", "1:1"] as AspectRatio[]).map((ar) => (
                <button
                  key={ar}
                  type="button"
                  className={`vf-tab ${settings.aspectRatio === ar ? "active" : ""}`}
                  style={{ padding: "4px 8px", fontSize: "11px", fontWeight: 700 }}
                  onClick={() => handleSaveSettings({ aspectRatio: ar })}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          {/* Video Aspect Canvas Viewport */}
          <div
            style={{
              width: "100%",
              maxWidth: settings.aspectRatio === "9:16" ? "320px" : "100%",
              margin: "0 auto",
              aspectRatio: aspectClass,
              backgroundColor: "#000",
              borderRadius: "10px",
              overflow: "hidden",
              position: "relative",
              boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {activeClip?.assignedAssetUrl ? (
              activeClip.assignedAssetType === "video" ? (
                <video
                  src={activeClip.assignedAssetUrl}
                  autoPlay
                  loop
                  muted
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeClip.assignedAssetUrl}
                  alt={activeClip.title}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: motionStyle,
                    transition: "transform 1.2s ease-in-out",
                  }}
                />
              )
            ) : (
              <div style={{ textAlign: "center", padding: "20px", color: "var(--muted)" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>🎬</div>
                <strong style={{ display: "block", color: "var(--text)", fontSize: "14px", marginBottom: "4px" }}>
                  {activeClip?.title || "Scene Preview"}
                </strong>
                <p style={{ fontSize: "12px", maxWidth: "260px", margin: "0 auto" }}>
                  {activeClip?.visualDirection || "No visual asset linked to this scene."}
                </p>
              </div>
            )}

            {/* In-Canvas HUD */}
            <div
              style={{
                position: "absolute",
                top: "10px",
                left: "12px",
                backgroundColor: "rgba(0,0,0,0.6)",
                padding: "3px 8px",
                borderRadius: "4px",
                fontSize: "11px",
                color: "#fff",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              {activeClip?.title} • {formatEditorClock(currentTime)}
            </div>

            {/* Active Transition Badge */}
            {activeClip?.transition && (
              <div
                style={{
                  position: "absolute",
                  top: "10px",
                  right: "12px",
                  backgroundColor: "rgba(0,0,0,0.6)",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  color: "var(--brand)",
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                ⚲ {activeClip.transition}
              </div>
            )}
          </div>

          {/* Master Transport Controls */}
          <div style={{ marginTop: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                type="button"
                className="vf-button"
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "50%",
                  padding: 0,
                  display: "grid",
                  placeItems: "center",
                  fontSize: "16px",
                  background: isPlaying ? "var(--warning)" : "var(--brand)",
                  color: "#fff",
                }}
                onClick={() => setIsPlaying(!isPlaying)}
                aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>

              <button
                type="button"
                className="vf-button secondary"
                style={{ padding: "6px 12px", fontSize: "12px" }}
                onClick={() => setCurrentTime(0)}
              >
                ⏮ Start
              </button>

              <div style={{ flex: 1 }}>
                <input
                  type="range"
                  min={0}
                  max={totalDuration || 10}
                  step={0.1}
                  value={currentTime}
                  onChange={(e) => setCurrentTime(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--brand)", cursor: "pointer" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                  <span>{formatEditorClock(currentTime)}</span>
                  <span>{formatEditorClock(totalDuration)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Scene & Clip Properties Inspector */}
        <div className="panel" style={{ padding: "18px", borderRadius: "14px" }}>
          <h2 style={{ fontSize: "15px", marginBottom: "14px" }}>
            Clip Inspector: {selectedClip?.title || "Select Scene"}
          </h2>

          {selectedClip ? (
            <div style={{ display: "grid", gap: "16px" }}>
              {/* Narration Preview */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                  Scene Narration
                </label>
                <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.45, color: "var(--text)" }}>
                  {selectedClip.narration || "No narration assigned to this scene."}
                </p>
              </div>

              {/* Visual Asset Linker */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
                  Visual Media Asset
                </label>
                <select
                  className="vf-input"
                  value={selectedClip.assignedAssetId ?? ""}
                  onChange={(e) =>
                    handleUpdateSelectedClip({
                      assignedAssetId: e.target.value || null,
                    })
                  }
                  style={{ width: "100%", padding: "8px 10px" }}
                >
                  <option value="">(No visual asset linked)</option>
                  {availableAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.mediaType === "video" ? "🎬" : "🖼"} {asset.originalFilename}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scene Duration */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                  <span style={{ color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Duration</span>
                  <strong>{selectedClip.durationSeconds}s</strong>
                </div>
                <input
                  type="range"
                  min={2}
                  max={60}
                  value={selectedClip.durationSeconds}
                  onChange={(e) =>
                    handleUpdateSelectedClip({
                      durationSeconds: Number(e.target.value),
                    })
                  }
                  style={{ width: "100%", accentColor: "var(--brand)" }}
                />
              </div>

              {/* Transition Style */}
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                    Scene Transition
                  </label>
                  <select
                    className="vf-input"
                    value={selectedClip.transition}
                    onChange={(e) =>
                      handleUpdateSelectedClip({
                        transition: e.target.value as TransitionType,
                      })
                    }
                    style={{ width: "100%", padding: "6px 8px", fontSize: "12px" }}
                  >
                    <option value="dissolve">Dissolve</option>
                    <option value="fade">Fade to Black</option>
                    <option value="cut">Direct Cut</option>
                    <option value="slide">Slide Left</option>
                    <option value="zoom">Zoom Transition</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                    Transition (s)
                  </label>
                  <input
                    type="number"
                    step={0.1}
                    min={0.1}
                    max={3.0}
                    className="vf-input"
                    value={selectedClip.transitionDurationSeconds}
                    onChange={(e) =>
                      handleUpdateSelectedClip({
                        transitionDurationSeconds: parseFloat(e.target.value) || 0.8,
                      })
                    }
                    style={{ width: "100%", padding: "6px 8px", fontSize: "12px" }}
                  />
                </div>
              </div>

              {/* Motion / Ken Burns Effect */}
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                  Camera Motion (Ken Burns)
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                  {(["none", "zoom-in", "zoom-out", "pan-left", "pan-right"] as MotionEffect[]).map((motion) => (
                    <button
                      key={motion}
                      type="button"
                      className={`vf-tab ${selectedClip.motionEffect === motion ? "active" : ""}`}
                      style={{ padding: "6px 8px", fontSize: "11px", textTransform: "capitalize" }}
                      onClick={() => handleUpdateSelectedClip({ motionEffect: motion })}
                    >
                      {motion.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="subtle">Select a scene block on the timeline below to inspect and customize its settings.</p>
          )}
        </div>
      </div>

      {/* Multi-Track Composition Timeline */}
      <section className="panel" style={{ padding: "18px", borderRadius: "14px" }} aria-label="Timeline tracks">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h2 style={{ fontSize: "15px", margin: 0 }}>Timeline Sequence</h2>
          <span style={{ fontSize: "12px", color: "var(--muted)" }}>
            Total duration: {formatEditorClock(totalDuration)} • {clips.length} scenes
          </span>
        </div>

        {/* Video / Scenes Track */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Track 1: Video Scenes & Transitions
          </div>

          <div
            style={{
              display: "flex",
              gap: "4px",
              background: "var(--surface)",
              padding: "8px",
              borderRadius: "10px",
              border: "1px solid var(--line)",
              overflowX: "auto",
            }}
          >
            {timelineClips.map((clip, index) => {
              const isSelected = clip.id === selectedSceneId;
              const isPlayingHere = currentTime >= clip.timelineStart && currentTime < clip.timelineEnd;
              const widthRatio = Math.max(90, (clip.durationSeconds / (totalDuration || 1)) * 900);

              return (
                <div
                  key={clip.id}
                  onClick={() => {
                    setSelectedSceneId(clip.id);
                    setCurrentTime(clip.timelineStart);
                  }}
                  style={{
                    flex: `0 0 ${widthRatio}px`,
                    minWidth: "100px",
                    padding: "10px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    border: isPlayingHere
                      ? "2px solid var(--brand)"
                      : isSelected
                        ? "2px solid var(--line-strong)"
                        : "1px solid var(--line)",
                    background: isPlayingHere
                      ? "var(--brand-soft)"
                      : isSelected
                        ? "var(--hover)"
                        : "var(--raised)",
                    position: "relative",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10px", fontWeight: 800, color: "var(--muted)" }}>
                      #{index + 1}
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text)" }}>
                      {clip.durationSeconds}s
                    </span>
                  </div>

                  <strong
                    style={{
                      display: "block",
                      fontSize: "12px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={clip.title}
                  >
                    {clip.title}
                  </strong>

                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px", fontSize: "10px", color: "var(--muted)" }}>
                    <span>{clip.assignedAssetUrl ? "🖼 Linked" : "⚠️ No asset"}</span>
                    <span>•</span>
                    <span style={{ textTransform: "capitalize" }}>{clip.transition}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audio Track Indicator */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
            Track 2: Audio & Voiceover Mix
          </div>
          <div
            style={{
              padding: "12px 16px",
              background: "var(--surface)",
              borderRadius: "8px",
              border: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "16px" }}>🎵</span>
              <span style={{ fontSize: "12px", fontWeight: 600 }}>Master Audio Synchronizer</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>
                Master Volume
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.masterVolume}
                onChange={(e) => handleSaveSettings({ masterVolume: Number(e.target.value) })}
                style={{ width: "90px", accentColor: "var(--brand)" }}
              />
              <span style={{ fontSize: "12px", color: "var(--muted)", width: "34px", textAlign: "right" }}>
                {settings.masterVolume}%
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

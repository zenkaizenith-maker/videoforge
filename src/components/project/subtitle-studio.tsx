"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/feedback";
import {
  autoGenerateSubtitles,
  exportSubtitles,
  saveSubtitles,
} from "@/app/projects/[id]/subtitles/actions";
import {
  DEFAULT_SUBTITLE_STYLE,
  formatSubtitleTime,
  parseSubtitleTime,
  SUBTITLE_PRESETS,
  type SubtitleAlignment,
  type SubtitleCue,
  type SubtitleData,
  type SubtitlePosition,
  type SubtitlePreset,
  type SubtitleStyle,
} from "@/lib/subtitles/types";

interface SubtitleStudioProps {
  projectId: string;
  projectTitle: string;
  initialSubtitles: SubtitleData;
  initialScenes: { id: string; title: string; estimatedDurationSeconds: number }[];
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

export function SubtitleStudio({
  projectId,
  projectTitle,
  initialSubtitles,
  initialScenes,
}: SubtitleStudioProps) {
  const [subtitles, setSubtitles] = useState<SubtitleData>(initialSubtitles);
  const [cues, setCues] = useState<SubtitleCue[]>(initialSubtitles.cues || []);
  const [style, setStyle] = useState<SubtitleStyle>(initialSubtitles.style || DEFAULT_SUBTITLE_STYLE);
  const [enabled, setEnabled] = useState<boolean>(initialSubtitles.enabled ?? true);

  // Playback & preview scrubber
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Filter/search
  const [searchQuery, setSearchQuery] = useState("");

  // Saving & Feedback
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Confirm dialog for re-generating
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);

  // Total project duration calculated from scenes
  const totalDuration = useMemo(() => {
    const fromScenes = initialScenes.reduce((acc, s) => acc + (s.estimatedDurationSeconds || 15), 0);
    const maxCueTime = cues.reduce((max, c) => Math.max(max, c.endTime), 0);
    return Math.max(fromScenes, maxCueTime, 10);
  }, [initialScenes, cues]);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  }, []);

  // Derive active cue from current scrubber timestamp
  const activeCue = useMemo(() => {
    return cues.find((c) => currentTime >= c.startTime && currentTime <= c.endTime) ?? null;
  }, [currentTime, cues]);

  const activeCueId = activeCue?.id ?? null;

  // Timeline playback timer
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

  // Active cue to render in visual preview
  const previewCue = useMemo(() => {
    if (activeCue) {
      return activeCue;
    }
    // If scrubber isn't within any cue, show the nearest upcoming or first cue for visual styling preview
    return cues.find((c) => c.startTime >= currentTime) || cues[0] || null;
  }, [cues, activeCue, currentTime]);

  // Filtered cues list
  const filteredCues = useMemo(() => {
    if (!searchQuery.trim()) return cues;
    const q = searchQuery.toLowerCase().trim();
    return cues.filter((c) => c.text.toLowerCase().includes(q));
  }, [cues, searchQuery]);

  // Handle cue updates
  function handleUpdateCue(cueId: string, updates: Partial<SubtitleCue>) {
    setCues((prev) =>
      prev.map((c) => {
        if (c.id !== cueId) return c;
        const updated = { ...c, ...updates };
        return updated;
      }),
    );
  }

  // Handle cue deletion
  function handleDeleteCue(cueId: string) {
    setCues((prev) => prev.filter((c) => c.id !== cueId));
    flash("Subtitle cue removed.");
  }

  // Add new cue
  function handleAddCue(afterTime?: number) {
    const start = afterTime !== undefined ? afterTime : currentTime;
    const end = start + 3;
    const newCue: SubtitleCue = {
      id: `cue-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      text: "New subtitle line",
    };

    setCues((prev) => [...prev, newCue].sort((a, b) => a.startTime - b.startTime));
    setCurrentTime(newCue.startTime);
    flash("Added new subtitle cue.");
  }

  // Save changes to database
  async function handleSave() {
    setSaveState("saving");
    setError("");
    const result = await saveSubtitles({
      projectId,
      enabled,
      cues,
      style,
    });

    if (!result.ok) {
      setError(result.error);
      setSaveState("error");
      return;
    }

    setSubtitles(result.data.subtitles);
    setSaveState("saved");
    flash("Subtitle track and styling saved.");
    setTimeout(() => setSaveState("idle"), 2500);
  }

  // Auto generate from scenes
  async function handleAutoGenerate() {
    setShowRegenerateDialog(false);
    setSaveState("saving");
    setError("");
    const result = await autoGenerateSubtitles(projectId);
    if (!result.ok) {
      setError(result.error);
      setSaveState("error");
      return;
    }
    setCues(result.data.subtitles.cues);
    setEnabled(true);
    setSaveState("saved");
    flash("Auto-generated subtitle cues from script narration.");
    setTimeout(() => setSaveState("idle"), 2500);
  }

  // Export SRT / VTT directly in browser
  async function handleExport(format: "srt" | "vtt") {
    const result = await exportSubtitles(projectId, format);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const blob = new Blob([result.data.content], { type: result.data.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.data.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flash(`Exported ${result.data.filename}`);
  }

  // Apply preset
  function handleApplyPreset(preset: SubtitlePreset) {
    const presetOverrides = SUBTITLE_PRESETS[preset];
    setStyle((prev) => ({
      ...prev,
      ...presetOverrides,
      preset,
    }));
  }

  // Metrics
  const totalWords = useMemo(
    () => cues.reduce((sum, c) => sum + c.text.trim().split(/\s+/).filter(Boolean).length, 0),
    [cues],
  );

  return (
    <div className="studio">
      {/* Header */}
      <header className="studio-head">
        <div>
          <nav className="studio-breadcrumb" aria-label="Breadcrumb">
            <Link href="/projects">Projects</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/projects/${projectId}`}>{projectTitle}</Link>
            <span aria-hidden="true">/</span>
            <strong>Subtitles</strong>
          </nav>
          <h1>Subtitles Studio</h1>
          <p className="subtle">
            Generate, edit, and visually style synchronized captions for high viewer engagement.
          </p>
        </div>

        <div className="studio-head-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleExport("srt")}
            disabled={cues.length === 0}
          >
            Export .SRT
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleExport("vtt")}
            disabled={cues.length === 0}
          >
            Export .VTT
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saveState === "saving"}
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save subtitles"}
          </Button>
        </div>
      </header>

      {/* Alerts */}
      {error && (
        <Alert tone="danger" title="Something went wrong">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="warning" title="Subtitles Studio Updated">
          {notice}
        </Alert>
      )}

      {/* Production Stages Bar */}
      <nav className="studio-stages" aria-label="Production stages">
        {STAGES.map(([label, href]) => {
          const isActive = label === "Subtitles";
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
      <section className="studio-metrics" aria-label="Subtitle statistics">
        <div className="studio-metric">
          <span>Total Cues</span>
          <strong>{String(cues.length).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Total Captioned Words</span>
          <strong>{totalWords}</strong>
        </div>
        <div className="studio-metric">
          <span>Active Preset</span>
          <strong style={{ fontSize: "15px", textTransform: "capitalize" }}>{style.preset}</strong>
        </div>
        <div className="studio-metric">
          <span>Placement</span>
          <strong style={{ fontSize: "15px", textTransform: "capitalize" }}>
            {style.position} • {style.alignment}
          </strong>
        </div>
        <div className="studio-metric">
          <span>Captions Status</span>
          <strong style={{ fontSize: "15px", color: enabled ? "var(--success)" : "var(--muted)" }}>
            {enabled ? "Active" : "Disabled"}
          </strong>
        </div>
      </section>

      {/* 2-Column Main Workspace */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 460px) minmax(0, 1fr)", gap: "20px", alignItems: "start" }}>
        {/* Left Column: Live Visual Canvas & Styling Controls */}
        <div style={{ display: "grid", gap: "16px", position: "sticky", top: "20px" }}>
          {/* Visual Video Preview Player Canvas */}
          <div
            className="panel"
            style={{
              padding: "16px",
              borderRadius: "14px",
              background: "var(--surface)",
              border: "1px solid var(--line)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <span className="studio-overline">Realtime Subtitle Canvas</span>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span>Enable subtitles</span>
              </label>
            </div>

            {/* Video Aspect Canvas */}
            <div
              style={{
                width: "100%",
                aspectRatio: "16 / 9",
                background: "radial-gradient(ellipse at center, #1e293b 0%, #090d16 100%)",
                borderRadius: "10px",
                position: "relative",
                display: "flex",
                flexDirection: "column",
                justifyContent:
                  style.position === "top"
                    ? "flex-start"
                    : style.position === "center"
                      ? "center"
                      : "flex-end",
                alignItems:
                  style.alignment === "left"
                    ? "flex-start"
                    : style.alignment === "right"
                      ? "flex-end"
                      : "center",
                padding: "24px",
                overflow: "hidden",
                boxShadow: "inset 0 0 40px rgba(0,0,0,0.8)",
              }}
            >
              {/* Scene Watermark / Indicator */}
              <div
                style={{
                  position: "absolute",
                  top: "10px",
                  left: "12px",
                  fontSize: "11px",
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                Preview: {formatSubtitleTime(currentTime, "clock")}
              </div>

              {/* Rendered Subtitle Box */}
              {enabled && previewCue && (
                <div
                  style={{
                    backgroundColor: style.backgroundColor,
                    color: style.textColor,
                    fontSize: `${style.fontSize}px`,
                    fontFamily: style.fontFamily,
                    textAlign: style.alignment,
                    textTransform: style.textTransform,
                    textShadow: style.shadow
                      ? "0 2px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.5)"
                      : "none",
                    padding: style.backgroundColor !== "transparent" ? "8px 14px" : "4px 8px",
                    borderRadius: style.backgroundColor !== "transparent" ? "8px" : "0",
                    maxWidth: "90%",
                    lineHeight: 1.35,
                    fontWeight: 700,
                    transition: "all 0.15s ease-out",
                  }}
                >
                  {previewCue.text}
                </div>
              )}
            </div>

            {/* Scrubber Timeline Controls */}
            <div style={{ marginTop: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  type="button"
                  className="vf-button"
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    padding: 0,
                    display: "grid",
                    placeItems: "center",
                    fontSize: "14px",
                    background: isPlaying ? "var(--warning)" : "var(--brand)",
                    color: "#fff",
                  }}
                  onClick={() => setIsPlaying(!isPlaying)}
                  aria-label={isPlaying ? "Pause scrubber" : "Play scrubber"}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>

                <div style={{ flex: 1 }}>
                  <input
                    type="range"
                    min={0}
                    max={totalDuration}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => setCurrentTime(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--brand)", cursor: "pointer" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
                    <span>{formatSubtitleTime(currentTime, "clock")}</span>
                    <span>{formatSubtitleTime(totalDuration, "clock")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Subtitle Style Customization Panel */}
          <div className="panel" style={{ padding: "18px", borderRadius: "14px" }}>
            <h2 style={{ fontSize: "14px", marginBottom: "14px" }}>Typography & Placement</h2>

            {/* Preset Selector */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "8px" }}>
                Presets
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                {(["cinematic", "karaoke", "bold-yellow", "classic", "minimal", "boxed"] as SubtitlePreset[]).map(
                  (p) => (
                    <button
                      key={p}
                      type="button"
                      className={`vf-tab ${style.preset === p ? "active" : ""}`}
                      style={{ padding: "6px 8px", fontSize: "11px", textTransform: "capitalize", fontWeight: 700 }}
                      onClick={() => handleApplyPreset(p)}
                    >
                      {p.replace("-", " ")}
                    </button>
                  ),
                )}
              </div>
            </div>

            {/* Position & Alignment */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
                  Position
                </label>
                <div style={{ display: "flex", gap: "4px" }}>
                  {(["top", "center", "bottom"] as SubtitlePosition[]).map((pos) => (
                    <button
                      key={pos}
                      type="button"
                      className={`vf-tab ${style.position === pos ? "active" : ""}`}
                      style={{ flex: 1, padding: "5px 6px", fontSize: "11px", textTransform: "capitalize" }}
                      onClick={() => setStyle((s) => ({ ...s, position: pos }))}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
                  Alignment
                </label>
                <div style={{ display: "flex", gap: "4px" }}>
                  {(["left", "center", "right"] as SubtitleAlignment[]).map((align) => (
                    <button
                      key={align}
                      type="button"
                      className={`vf-tab ${style.alignment === align ? "active" : ""}`}
                      style={{ flex: 1, padding: "5px 6px", fontSize: "11px", textTransform: "capitalize" }}
                      onClick={() => setStyle((s) => ({ ...s, alignment: align }))}
                    >
                      {align}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Font Size & Colors */}
            <div style={{ display: "grid", gap: "12px" }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                  <span style={{ color: "var(--muted)", textTransform: "uppercase", fontWeight: 700 }}>Font Size</span>
                  <span>{style.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={44}
                  value={style.fontSize}
                  onChange={(e) => setStyle((s) => ({ ...s, fontSize: Number(e.target.value) }))}
                  style={{ width: "100%", accentColor: "var(--brand)" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                    Text Color
                  </label>
                  <input
                    type="color"
                    className="vf-input"
                    value={style.textColor.startsWith("#") ? style.textColor : "#ffffff"}
                    onChange={(e) => setStyle((s) => ({ ...s, textColor: e.target.value }))}
                    style={{ width: "100%", height: "34px", padding: "2px" }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "4px" }}>
                    Highlight Color
                  </label>
                  <input
                    type="color"
                    className="vf-input"
                    value={style.highlightColor.startsWith("#") ? style.highlightColor : "#facc15"}
                    onChange={(e) => setStyle((s) => ({ ...s, highlightColor: e.target.value }))}
                    style={{ width: "100%", height: "34px", padding: "2px" }}
                  />
                </div>
              </div>

              {/* Text Transform & Shadow */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px", borderTop: "1px solid var(--line)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={style.textTransform === "uppercase"}
                    onChange={(e) =>
                      setStyle((s) => ({
                        ...s,
                        textTransform: e.target.checked ? "uppercase" : "none",
                      }))
                    }
                  />
                  <span>ALL CAPS</span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={style.shadow}
                    onChange={(e) => setStyle((s) => ({ ...s, shadow: e.target.checked }))}
                  />
                  <span>Drop Shadow</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Cue Editor List */}
        <div style={{ display: "grid", gap: "16px" }}>
          {/* Action Toolbar */}
          <div
            className="panel"
            style={{
              padding: "14px 18px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              borderRadius: "14px",
            }}
          >
            <div style={{ position: "relative", width: "min(280px, 100%)" }}>
              <span
                className="search-icon"
                aria-hidden="true"
                style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}
              >
                ⌕
              </span>
              <input
                type="search"
                className="vf-input"
                placeholder="Filter subtitle text…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: "30px", width: "100%" }}
              />
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowRegenerateDialog(true)}
              >
                ⚡ Auto-generate from script
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleAddCue()}
              >
                + Add cue
              </Button>
            </div>
          </div>

          {/* Cues List */}
          {filteredCues.length === 0 ? (
            <div
              className="panel"
              style={{
                textAlign: "center",
                padding: "48px 20px",
                border: "1px dashed var(--line)",
                borderRadius: "14px",
              }}
            >
              <div style={{ fontSize: "32px", marginBottom: "10px" }}>💬</div>
              <h2 style={{ fontSize: "16px", marginBottom: "6px" }}>No subtitle cues found</h2>
              <p className="subtle" style={{ maxWidth: "420px", margin: "0 auto 18px" }}>
                {searchQuery
                  ? "No cues match your search keyword."
                  : "Auto-generate subtitles automatically from your script scenes and narration, or create cues manually."}
              </p>
              <Button type="button" onClick={() => setShowRegenerateDialog(true)}>
                Auto-generate from script
              </Button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }} aria-label="Subtitle cues list">
              {filteredCues.map((cue, index) => {
                const isActive = activeCueId === cue.id;
                const duration = Math.max(0, cue.endTime - cue.startTime);

                return (
                  <div
                    key={cue.id}
                    className="panel"
                    style={{
                      padding: "14px 18px",
                      borderRadius: "12px",
                      border: isActive ? "1px solid var(--brand)" : "1px solid var(--line)",
                      background: isActive ? "var(--surface)" : "var(--raised)",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "10px" }}>
                      {/* Cue Index and Play Jump */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                          type="button"
                          style={{
                            background: isActive ? "var(--brand)" : "var(--hover)",
                            color: isActive ? "#fff" : "var(--muted)",
                            border: "none",
                            borderRadius: "6px",
                            padding: "3px 8px",
                            fontSize: "11px",
                            fontWeight: 800,
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            setCurrentTime(cue.startTime);
                            setIsPlaying(true);
                          }}
                          title="Seek player to this cue"
                        >
                          #{index + 1} ▶
                        </button>

                        <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                          Duration: <strong style={{ color: "var(--text)" }}>{duration.toFixed(1)}s</strong>
                        </span>
                      </div>

                      {/* Timing Inputs (Start / End) */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <label style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>
                          In:
                        </label>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          className="vf-input"
                          value={cue.startTime}
                          onChange={(e) =>
                            handleUpdateCue(cue.id, {
                              startTime: Number(parseFloat(e.target.value).toFixed(2)) || 0,
                            })
                          }
                          style={{ width: "80px", padding: "4px 8px", fontSize: "12px" }}
                        />

                        <label style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase" }}>
                          Out:
                        </label>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          className="vf-input"
                          value={cue.endTime}
                          onChange={(e) =>
                            handleUpdateCue(cue.id, {
                              endTime: Number(parseFloat(e.target.value).toFixed(2)) || 0,
                            })
                          }
                          style={{ width: "80px", padding: "4px 8px", fontSize: "12px" }}
                        />

                        {/* Delete button */}
                        <button
                          type="button"
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--danger)",
                            cursor: "pointer",
                            fontSize: "14px",
                            padding: "4px 8px",
                          }}
                          onClick={() => handleDeleteCue(cue.id)}
                          title="Delete cue"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Cue Text Input */}
                    <textarea
                      className="vf-input"
                      rows={2}
                      value={cue.text}
                      onChange={(e) => handleUpdateCue(cue.id, { text: e.target.value })}
                      placeholder="Subtitle caption text…"
                      style={{
                        width: "100%",
                        fontFamily: style.fontFamily,
                        fontSize: "14px",
                        lineHeight: 1.4,
                        resize: "vertical",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Auto-generate confirmation dialog */}
      <ConfirmDialog
        open={showRegenerateDialog}
        title="Auto-generate subtitle track?"
        description="This will scan all scenes and narration in this project to generate accurately timed subtitle cues. Any existing custom edits to subtitle timestamps will be refreshed."
        confirmLabel="Generate subtitles"
        onConfirm={handleAutoGenerate}
        onCancel={() => setShowRegenerateDialog(false)}
      />
    </div>
  );
}

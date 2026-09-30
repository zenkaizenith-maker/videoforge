"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  autoGenerateMetadata,
  publishProject,
  updateMetadata,
} from "@/app/projects/[id]/publish/actions";
import type {
  PublishMetadata,
  PublishPlatform,
  PublishStudioData,
  VideoPrivacy,
} from "@/lib/publish/types";
import { formatEditorClock } from "@/lib/editor/types";

interface PublishStudioProps {
  initialData: PublishStudioData;
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

export function PublishStudio({ initialData }: PublishStudioProps) {
  const { projectId, projectTitle, isRendered, isYouTubeConnected, srtContent, vttContent } = initialData;

  const [metadata, setMetadata] = useState<PublishMetadata>(initialData.metadata);
  const [activePlatform, setActivePlatform] = useState<PublishPlatform>("youtube");

  const [isPublishing, setIsPublishing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  }, []);

  async function handleSaveMetadata() {
    setSaveState("saving");
    setError("");

    const result = await updateMetadata({
      projectId,
      metadata,
    });

    if (!result.ok) {
      setError(result.error);
      setSaveState("error");
      return;
    }

    setMetadata(result.data.metadata);
    setSaveState("saved");
    flash("Distribution metadata saved.");
    setTimeout(() => setSaveState("idle"), 2500);
  }

  async function handleAutoGenerate() {
    setSaveState("saving");
    setError("");

    const result = await autoGenerateMetadata(projectId);
    if (!result.ok) {
      setError(result.error);
      setSaveState("error");
      return;
    }

    setMetadata(result.data.metadata);
    setSaveState("saved");
    flash("Generated SEO description, timestamps, and tags.");
    setTimeout(() => setSaveState("idle"), 2500);
  }

  async function handlePublishOrExport() {
    setIsPublishing(true);
    setError("");

    const result = await publishProject(projectId, metadata);
    setIsPublishing(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMetadata(result.data.metadata);
    if (isYouTubeConnected) {
      flash("Video uploaded to YouTube successfully! 🎉");
    } else {
      flash("Production distribution package marked ready! 🎉");
    }
  }

  function handleCopyCompletePackage() {
    const pkg = `TITLE:\n${metadata.title}\n\nDESCRIPTION & CHAPTERS:\n${metadata.description}\n\nTAGS:\n${metadata.tags.join(", ")}`;
    navigator.clipboard.writeText(pkg);
    flash("Copied complete YouTube title, description, and tags to clipboard!");
  }

  function handleCopyEmbed() {
    const embedSnippet = `<iframe width="560" height="315" src="https://videoforge.dev/embed/${projectId}" title="${metadata.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    navigator.clipboard.writeText(embedSnippet);
    flash("Copied responsive embed snippet to clipboard!");
  }

  const isPublished = Boolean(metadata.publishedAt);


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
            <strong>Publish</strong>
          </nav>
          <h1>Publish & Distribution</h1>
          <p className="subtle">
            Publish your rendered master to YouTube, distribute across social channels, or export embed packages.
          </p>
        </div>

        <div className="studio-head-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={handleSaveMetadata}
            disabled={saveState === "saving"}
          >
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : "Save metadata"}
          </Button>

          <Button
            type="button"
            onClick={handlePublishOrExport}
            disabled={isPublishing}
          >
            {isPublishing
              ? "Saving…"
              : isPublished
                ? "Update Distribution ✓"
                : isYouTubeConnected
                  ? "Publish to YouTube 🚀"
                  : "Mark Ready for Distribution ✓"}
          </Button>
        </div>
      </header>

      {/* Alerts */}
      {error && (
        <Alert tone="danger" title="Publication issue">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="warning" title="Publishing Studio">
          {notice}
        </Alert>
      )}

      {/* Success Banner if Published */}
      {isPublished && (
        <div
          className="panel"
          style={{
            padding: "16px 20px",
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid var(--success)",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "28px" }}>🎉</span>
            <div>
              <strong style={{ fontSize: "14px", display: "block", color: "var(--success)" }}>
                {isYouTubeConnected && metadata.youtubeVideoId
                  ? "Video is Live on YouTube!"
                  : "Video Distribution Package is Ready!"}
              </strong>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                Marked ready on {new Date(metadata.publishedAt!).toLocaleDateString()} at {new Date(metadata.publishedAt!).toLocaleTimeString()}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            {metadata.youtubeVideoId ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(`https://youtu.be/${metadata.youtubeVideoId}`);
                  flash("Copied live YouTube link!");
                }}
              >
                Copy YouTube Link 🔗
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleCopyCompletePackage}
              >
                Copy Complete Package 📋
              </Button>
            )}
          </div>
        </div>
      )}


      {/* Production Stages Bar */}
      <nav className="studio-stages" aria-label="Production stages">
        {STAGES.map(([label, href]) => {
          const isActive = label === "Publish";
          const projectHref =
            href === "script"
              ? `/projects/${projectId}/script`
              : `/projects/${projectId}/${href}`;

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
        })}
      </nav>

      {/* Studio Metrics */}
      <section className="studio-metrics" aria-label="Publish statistics">
        <div className="studio-metric">
          <span>Distribution Status</span>
          <strong style={{ color: isPublished ? "var(--success)" : "var(--brand)" }}>
            {isPublished ? "Published" : "Draft / Ready"}
          </strong>
        </div>
        <div className="studio-metric">
          <span>Master Duration</span>
          <strong>{formatEditorClock(initialData.videoDurationSeconds)}</strong>
        </div>
        <div className="studio-metric">
          <span>Chapters</span>
          <strong>{metadata.chapters.length} Timestamps</strong>
        </div>
        <div className="studio-metric">
          <span>Privacy</span>
          <strong style={{ textTransform: "capitalize" }}>{metadata.privacy}</strong>
        </div>
        <div className="studio-metric">
          <span>Render Pipeline</span>
          <strong style={{ color: isRendered ? "var(--success)" : "var(--warning)" }}>
            {isRendered ? "Master Ready" : "Awaiting Render"}
          </strong>
        </div>
      </section>

      {/* Platform Navigation Tabs */}
      <div className="project-filters" role="tablist" aria-label="Distribution channels">
        <button
          type="button"
          className={`vf-tab ${activePlatform === "youtube" ? "active" : ""}`}
          onClick={() => setActivePlatform("youtube")}
        >
          YouTube Distribution
        </button>
        <button
          type="button"
          className={`vf-tab ${activePlatform === "download" ? "active" : ""}`}
          onClick={() => setActivePlatform("download")}
        >
          Master Package Download
        </button>
        <button
          type="button"
          className={`vf-tab ${activePlatform === "embed" ? "active" : ""}`}
          onClick={() => setActivePlatform("embed")}
        >
          Web Embed Code
        </button>
      </div>

      {/* Tab Panels */}
      {activePlatform === "youtube" && (
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px", alignItems: "start" }}>
          {/* Metadata Form */}
          <div className="panel" style={{ padding: "20px", borderRadius: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", margin: 0 }}>YouTube Video Details</h2>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button type="button" size="sm" variant="secondary" onClick={handleCopyCompletePackage}>
                  Copy Package 📋
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={handleAutoGenerate}>
                  ⚡ Auto-SEO
                </Button>
              </div>
            </div>

            {/* Connection Status Notice */}
            <div
              style={{
                padding: "10px 14px",
                background: isYouTubeConnected ? "rgba(16, 185, 129, 0.1)" : "var(--surface)",
                border: `1px solid ${isYouTubeConnected ? "var(--success)" : "var(--line)"}`,
                borderRadius: "8px",
                marginBottom: "16px",
                fontSize: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                <strong>
                  {isYouTubeConnected ? "✓ Connected to YouTube API" : "○ YouTube OAuth: Manual Package Mode"}
                </strong>
                <span style={{ fontSize: "11px", color: isYouTubeConnected ? "var(--success)" : "var(--muted)" }}>
                  {isYouTubeConnected ? "1-Click Direct Upload" : "Credentials Not Configured"}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                {isYouTubeConnected
                  ? "Your environment is configured with YouTube OAuth credentials. Publishing directly uploads to your channel."
                  : "Direct 1-click publishing requires Google Cloud OAuth credentials (YOUTUBE_CLIENT_ID). You can copy the complete package below to paste into YouTube Studio in seconds, or download the master MP4 directly."}
              </p>
            </div>


            <div style={{ display: "grid", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
                  Video Title (max 100 chars)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  className="vf-input"
                  value={metadata.title}
                  onChange={(e) => setMetadata((m) => ({ ...m, title: e.target.value }))}
                  style={{ width: "100%" }}
                />
                <span style={{ fontSize: "11px", color: "var(--muted)", display: "block", textAlign: "right", marginTop: "4px" }}>
                  {metadata.title.length} / 100
                </span>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
                  Description & Chapter Timestamps
                </label>
                <textarea
                  className="vf-input"
                  rows={8}
                  value={metadata.description}
                  onChange={(e) => setMetadata((m) => ({ ...m, description: e.target.value }))}
                  style={{ width: "100%", lineHeight: 1.45, fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
                    Visibility / Privacy
                  </label>
                  <select
                    className="vf-input"
                    value={metadata.privacy}
                    onChange={(e) => setMetadata((m) => ({ ...m, privacy: e.target.value as VideoPrivacy }))}
                    style={{ width: "100%" }}
                  >
                    <option value="public">Public</option>
                    <option value="unlisted">Unlisted</option>
                    <option value="private">Private</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
                    Category
                  </label>
                  <select
                    className="vf-input"
                    value={metadata.category}
                    onChange={(e) => setMetadata((m) => ({ ...m, category: e.target.value }))}
                    style={{ width: "100%" }}
                  >
                    <option value="Education">Education</option>
                    <option value="Film & Animation">Film & Animation</option>
                    <option value="Entertainment">Entertainment</option>
                    <option value="Science & Technology">Science & Technology</option>
                    <option value="Howto & Style">Howto & Style</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "6px" }}>
                  Search Tags
                </label>
                <input
                  type="text"
                  className="vf-input"
                  placeholder="tag1, tag2, tag3"
                  value={metadata.tags.join(", ")}
                  onChange={(e) =>
                    setMetadata((m) => ({
                      ...m,
                      tags: e.target.value
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                    }))
                  }
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          </div>

          {/* Chapters & Timestamps Card */}
          <div className="panel" style={{ padding: "20px", borderRadius: "14px" }}>
            <h2 style={{ fontSize: "16px", marginBottom: "14px" }}>Generated Chapters ({metadata.chapters.length})</h2>

            <div style={{ display: "grid", gap: "8px" }}>
              {metadata.chapters.map((chap, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--surface)",
                    borderRadius: "8px",
                    fontSize: "12px",
                    border: "1px solid var(--line)",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{chap.title}</span>
                  <span
                    style={{
                      fontFamily: "monospace",
                      background: "var(--brand-soft)",
                      color: "var(--brand)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      fontWeight: 700,
                    }}
                  >
                    {chap.formattedTime}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activePlatform === "download" && (
        <div className="panel" style={{ padding: "24px", borderRadius: "14px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Production Assets Export Package</h2>
          <p className="subtle" style={{ marginBottom: "20px" }}>
            Download the standalone media files generated for this video project.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            <div style={{ padding: "16px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--surface)" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>🎞</div>
              <strong style={{ display: "block", marginBottom: "4px" }}>Master Video (.mp4)</strong>
              <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
                1080p H.264 video with baked transitions and mixed audio.
              </p>
              <a href={initialData.masterVideoUrl || "#"} download={`${projectTitle}-master.mp4`}>
                <Button type="button" size="sm" disabled={!isRendered}>
                  Download Video MP4
                </Button>
              </a>
            </div>

            <div style={{ padding: "16px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--surface)" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>💬</div>
              <strong style={{ display: "block", marginBottom: "4px" }}>Subtitles (.srt / .vtt)</strong>
              <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
                Synchronized caption track files for YouTube, Premiere, or VLC.
              </p>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {srtContent ? (
                  <a
                    href={`data:text/plain;charset=utf-8,${encodeURIComponent(srtContent)}`}
                    download={`${projectTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-captions.srt`}
                  >
                    <Button type="button" size="sm">
                      Download SRT
                    </Button>
                  </a>
                ) : null}
                {vttContent ? (
                  <a
                    href={`data:text/vtt;charset=utf-8,${encodeURIComponent(vttContent)}`}
                    download={`${projectTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-captions.vtt`}
                  >
                    <Button type="button" size="sm" variant="secondary">
                      Download VTT
                    </Button>
                  </a>
                ) : null}
                <Link href={`/projects/${projectId}/subtitles`}>
                  <Button type="button" size="sm" variant="secondary">
                    Studio
                  </Button>
                </Link>
              </div>
            </div>


            <div style={{ padding: "16px", border: "1px solid var(--line)", borderRadius: "10px", background: "var(--surface)" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>📋</div>
              <strong style={{ display: "block", marginBottom: "4px" }}>Script & Metadata Outline</strong>
              <p style={{ fontSize: "12px", color: "var(--muted)", marginBottom: "14px" }}>
                Original script outline, visual prompts, and scene directions.
              </p>
              <Link href={`/projects/${projectId}/script`}>
                <Button type="button" size="sm" variant="secondary">
                  Open Script Studio
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {activePlatform === "embed" && (
        <div className="panel" style={{ padding: "24px", borderRadius: "14px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>Embed on Your Website or Blog</h2>
          <p className="subtle" style={{ marginBottom: "18px" }}>
            Paste this HTML snippet into any CMS, Notion page, or web application to embed your video.
          </p>

          <div style={{ padding: "14px", background: "#0a0f1d", borderRadius: "8px", fontFamily: "monospace", fontSize: "12px", color: "#38bdf8", overflowX: "auto", marginBottom: "16px" }}>
            {`<iframe width="560" height="315" src="https://videoforge.dev/embed/${projectId}" title="${metadata.title}" frameborder="0" allowfullscreen></iframe>`}
          </div>

          <Button type="button" onClick={handleCopyEmbed}>
            Copy Embed HTML Code 📋
          </Button>
        </div>
      )}
    </div>
  );
}

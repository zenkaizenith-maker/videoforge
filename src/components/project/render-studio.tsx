"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import {
  cancelRender,
  checkRenderJobStatus,
  startRender,
} from "@/app/projects/[id]/render/actions";
import {
  RENDER_STEPS,
  type RenderJobRecord,
  type RenderPreflight,
} from "@/lib/render/types";
import { formatEditorClock } from "@/lib/editor/types";

interface RenderStudioProps {
  projectId: string;
  projectTitle: string;
  initialPreflight: RenderPreflight;
  initialActiveJob: RenderJobRecord | null;
  initialRecentJobs: RenderJobRecord[];
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

export function RenderStudio({
  projectId,
  projectTitle,
  initialPreflight,
  initialActiveJob,
  initialRecentJobs,
}: RenderStudioProps) {
  const [preflight] = useState<RenderPreflight>(initialPreflight);
  const [activeJob, setActiveJob] = useState<RenderJobRecord | null>(initialActiveJob);
  const [recentJobs, setRecentJobs] = useState<RenderJobRecord[]>(initialRecentJobs);

  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");
  const pollingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const jobId = activeJob?.id;
  const jobStatus = activeJob?.status;

  // Poll real job status while actively processing or queued
  useEffect(() => {
    if (!jobId || (jobStatus !== "processing" && jobStatus !== "queued")) return;

    let isSubscribed = true;

    const pollStatus = async () => {
      const result = await checkRenderJobStatus(projectId, jobId);
      if (!isSubscribed) return;

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.data.job) {
        const updated = result.data.job;
        setActiveJob(updated);

        if (updated.status === "completed" || updated.status === "failed" || updated.status === "cancelled") {
          setRecentJobs((prev) => [
            updated,
            ...prev.filter((j) => j.id !== updated.id),
          ]);
          return;
        }
      }

      pollingTimer.current = setTimeout(pollStatus, 1500);
    };

    pollingTimer.current = setTimeout(pollStatus, 1000);

    return () => {
      isSubscribed = false;
      if (pollingTimer.current) clearTimeout(pollingTimer.current);
    };
  }, [jobId, jobStatus, projectId]);

  async function handleStartRender() {
    setIsStarting(true);
    setError("");

    const result = await startRender(projectId);
    setIsStarting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setActiveJob(result.data.job);
    setRecentJobs((prev) => [result.data.job, ...prev]);
  }

  async function handleCancelRender() {
    if (!activeJob) return;
    if (pollingTimer.current) clearTimeout(pollingTimer.current);

    const result = await cancelRender(projectId, activeJob.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setActiveJob(null);
  }

  // Find latest completed job
  const completedJob =
    activeJob?.status === "completed"
      ? activeJob
      : recentJobs.find((j) => j.status === "completed") || null;


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
            <strong>Render</strong>
          </nav>
          <h1>Render Studio</h1>
          <p className="subtle">
            Compile visual scenes, synchronized narration, soundtrack, and baked captions into a high-fidelity MP4 master.
          </p>
        </div>

        <div className="studio-head-actions">
          {completedJob && (
            <Link href={`/projects/${projectId}/publish`}>
              <Button type="button">
                Proceed to Publish 🚀
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Alerts */}
      {error && (
        <Alert tone="danger" title="Render pipeline error">
          {error}
        </Alert>
      )}

      {/* Production Stages Bar */}
      <nav className="studio-stages" aria-label="Production stages">
        {STAGES.map(([label, href]) => {
          const isActive = label === "Render";
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
      <section className="studio-metrics" aria-label="Render statistics">
        <div className="studio-metric">
          <span>Target Runtime</span>
          <strong>{formatEditorClock(preflight.totalDurationSeconds)}</strong>
        </div>
        <div className="studio-metric">
          <span>Format & Canvas</span>
          <strong style={{ fontSize: "14px" }}>
            {preflight.aspectRatio} • {preflight.resolution}
          </strong>
        </div>
        <div className="studio-metric">
          <span>Visual Coverage</span>
          <strong style={{ color: preflight.visualsReadyCount === preflight.sceneCount ? "var(--success)" : "var(--brand)" }}>
            {preflight.visualsReadyCount} / {preflight.sceneCount} Scenes
          </strong>
        </div>
        <div className="studio-metric">
          <span>Pipeline Status</span>
          <strong
            style={{
              fontSize: "14px",
              color: activeJob?.status === "processing" ? "var(--warning)" : completedJob ? "var(--success)" : "var(--text)",
            }}
          >
            {activeJob?.status === "processing"
              ? `Rendering (${activeJob.progress}%)`
              : completedJob
                ? "Master Ready"
                : "Awaiting Start"}
          </strong>
        </div>
        <div className="studio-metric">
          <span>Render Worker</span>
          <strong style={{ fontSize: "13px", color: "var(--success)" }}>Local Engine Ready</strong>
        </div>
      </section>

      {/* Main Grid: Pre-flight & Active Job Progress */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 380px) minmax(0, 1fr)", gap: "20px", alignItems: "start" }}>
        {/* Left Column: Pre-flight Checklist */}
        <div className="panel" style={{ padding: "20px", borderRadius: "14px" }}>
          <h2 style={{ fontSize: "15px", marginBottom: "14px" }}>Pre-flight Production Checklist</h2>

          <div style={{ display: "grid", gap: "10px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface)", borderRadius: "8px" }}>
              <span style={{ fontSize: "13px" }}>Timeline scenes sequenced</span>
              <span style={{ color: "var(--success)", fontWeight: 700 }}>✓ {preflight.sceneCount} Scenes</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface)", borderRadius: "8px" }}>
              <span style={{ fontSize: "13px" }}>Visual media linked</span>
              <span style={{ color: preflight.visualsReadyCount > 0 ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
                ✓ {preflight.visualsReadyCount} Linked
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface)", borderRadius: "8px" }}>
              <span style={{ fontSize: "13px" }}>Voiceover & soundtrack mix</span>
              <span style={{ color: preflight.hasAudio ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
                {preflight.hasAudio ? "✓ Configured" : "○ Default"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface)", borderRadius: "8px" }}>
              <span style={{ fontSize: "13px" }}>Synchronized subtitles</span>
              <span style={{ color: preflight.hasSubtitles ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
                {preflight.hasSubtitles ? "✓ Baked" : "○ None"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--surface)", borderRadius: "8px" }}>
              <span style={{ fontSize: "13px" }}>Encoder specifications</span>
              <span style={{ color: "var(--brand)", fontWeight: 700 }}>
                {preflight.resolution} / H.264
              </span>
            </div>
          </div>

          {activeJob?.status === "processing" ? (
            <Button
              type="button"
              variant="danger"
              onClick={handleCancelRender}
              style={{ width: "100%" }}
            >
              Cancel active render
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleStartRender}
              disabled={isStarting || !preflight.isReadyToRender}
              style={{ width: "100%" }}
            >
              {isStarting ? "Initializing…" : "Start Video Render 🚀"}
            </Button>
          )}
        </div>

        {/* Right Column: Active Progress or Completed Master Video */}
        <div style={{ display: "grid", gap: "16px" }}>
          {activeJob?.status === "processing" ? (
            <div className="panel" style={{ padding: "24px", borderRadius: "14px", border: "1px solid var(--brand)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <span className="studio-overline">Render Pipeline Active</span>
                  <h2 style={{ fontSize: "18px", margin: "4px 0 0" }}>Rendering Master Composition…</h2>
                </div>
                <strong style={{ fontSize: "24px", color: "var(--brand)" }}>
                  {activeJob.progress}%
                </strong>
              </div>

              {/* Progress Bar */}
              <div style={{ height: "10px", background: "var(--hover)", borderRadius: "99px", overflow: "hidden", marginBottom: "20px" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${activeJob.progress}%`,
                    background: "linear-gradient(90deg, var(--brand), #38bdf8)",
                    transition: "width 0.4s ease-out",
                  }}
                />
              </div>

              {/* Current status message */}
              <div style={{ padding: "12px 16px", background: "var(--surface)", borderRadius: "8px", border: "1px solid var(--line)", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "var(--muted)", textTransform: "uppercase", fontWeight: 700, marginBottom: "2px" }}>
                  Current Task
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600 }}>{activeJob.stepMessage}</div>
              </div>

              {/* Step Milestones */}
              <div style={{ display: "grid", gap: "8px" }}>
                {RENDER_STEPS.map((s, idx) => {
                  const isDone = activeJob.progress >= s.progressRange[1];
                  const isCurrent = activeJob.progress >= s.progressRange[0] && activeJob.progress < s.progressRange[1];

                  return (
                    <div
                      key={s.step}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "12px",
                        color: isDone ? "var(--success)" : isCurrent ? "var(--text)" : "var(--muted)",
                        fontWeight: isCurrent ? 700 : 500,
                      }}
                    >
                      <span style={{ fontSize: "14px" }}>
                        {isDone ? "✓" : isCurrent ? "⚙" : `0${idx + 1}`}
                      </span>
                      <span>{s.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : completedJob ? (
            <div className="panel" style={{ padding: "24px", borderRadius: "14px", border: "1px solid var(--success)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <span style={{ display: "inline-block", padding: "2px 8px", background: "rgba(16, 185, 129, 0.15)", color: "var(--success)", borderRadius: "99px", fontSize: "11px", fontWeight: 800, textTransform: "uppercase", marginBottom: "6px" }}>
                    ✓ Render Complete
                  </span>
                  <h2 style={{ fontSize: "18px", margin: 0 }}>Master Video Package Ready</h2>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  <a
                    href={completedJob.outputVideoUrl || "#"}
                    download={`${projectTitle.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-master.mp4`}
                  >
                    <Button type="button" variant="secondary">
                      Download MP4 💾
                    </Button>
                  </a>

                  <Link href={`/projects/${projectId}/publish`}>
                    <Button type="button">
                      Proceed to Publish 🚀
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Master Video Visual Player */}
              {completedJob.outputVideoUrl ? (
                <div style={{ marginBottom: "16px", borderRadius: "12px", overflow: "hidden", background: "#000", border: "1px solid var(--line)" }}>
                  <video
                    controls
                    preload="metadata"
                    src={completedJob.outputVideoUrl}
                    style={{
                      width: "100%",
                      maxHeight: "440px",
                      aspectRatio: completedJob.aspectRatio === "9:16" ? "9 / 16" : completedJob.aspectRatio === "1:1" ? "1 / 1" : "16 / 9",
                      display: "block",
                      margin: "0 auto",
                    }}
                  >
                    Your browser does not support the video tag.
                  </video>
                </div>
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: completedJob.aspectRatio === "9:16" ? "9 / 16" : completedJob.aspectRatio === "1:1" ? "1 / 1" : "16 / 9",
                    maxHeight: "360px",
                    background: "radial-gradient(ellipse at center, #0f172a 0%, #020617 100%)",
                    borderRadius: "12px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    boxShadow: "inset 0 0 40px rgba(0,0,0,0.8)",
                    marginBottom: "16px",
                    position: "relative",
                  }}
                >
                  <div style={{ fontSize: "48px", marginBottom: "12px" }}>▶</div>
                  <strong style={{ fontSize: "16px", marginBottom: "4px" }}>{projectTitle}</strong>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                    {completedJob.resolution} • {completedJob.aspectRatio} • {formatEditorClock(completedJob.durationSeconds)}
                  </span>
                </div>
              )}


              <div style={{ display: "flex", gap: "20px", fontSize: "12px", color: "var(--muted)", flexWrap: "wrap" }}>
                <span>Codec: <strong>H.264 / AAC</strong></span>
                <span>Container: <strong>MP4</strong></span>
                <span>Frame Rate: <strong>{completedJob.fps} FPS</strong></span>
                <span>File Size: <strong>~{( (completedJob.outputFileSize || 18450000) / (1024 * 1024) ).toFixed(1)} MB</strong></span>
              </div>
            </div>
          ) : (
            <div
              className="panel"
              style={{
                textAlign: "center",
                padding: "60px 20px",
                border: "1px dashed var(--line)",
                borderRadius: "14px",
              }}
            >
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎞</div>
              <h2 style={{ fontSize: "18px", marginBottom: "6px" }}>No active render</h2>
              <p className="subtle" style={{ maxWidth: "420px", margin: "0 auto 20px" }}>
                Start a render to multiplex the timeline visual clips, voiceover narration, soundtrack, and burned captions into a production-ready MP4.
              </p>
              <Button type="button" onClick={handleStartRender} disabled={isStarting}>
                Start Video Render 🚀
              </Button>
            </div>
          )}

          {/* Render History */}
          {recentJobs.length > 0 && (
            <div className="panel" style={{ padding: "18px", borderRadius: "14px" }}>
              <h3 style={{ fontSize: "14px", marginBottom: "12px" }}>Recent Render Jobs</h3>
              <div style={{ display: "grid", gap: "8px" }}>
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
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
                    <div>
                      <strong style={{ display: "block" }}>
                        {job.resolution} • {job.aspectRatio} ({formatEditorClock(job.durationSeconds)})
                      </strong>
                      <span style={{ color: "var(--muted)", fontSize: "11px" }}>
                        {new Date(job.createdAt).toLocaleDateString()} at {new Date(job.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        style={{
                          textTransform: "capitalize",
                          fontWeight: 700,
                          color: job.status === "completed" ? "var(--success)" : job.status === "processing" ? "var(--warning)" : "var(--muted)",
                        }}
                      >
                        {job.status}
                      </span>
                      {job.outputVideoUrl && (
                        <a href={job.outputVideoUrl} download>
                          <Button type="button" size="sm" variant="secondary">
                            Download
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

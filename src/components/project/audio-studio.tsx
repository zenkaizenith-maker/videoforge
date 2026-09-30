"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/feedback";
import {
  confirmAudioUpload,
  deleteAudioTrack,
  getSignedAudioUrlAction,
  loadAudioTracks,
  requestSignedAudioUploadUrl,
  updateAudioTrack,
} from "@/app/projects/[id]/audio/actions";

import {
  formatDuration,
  type AudioCategory,
  type AudioFilter,
  type AudioTrack,
  AUDIO_ACCEPTED_TYPES,
  DEFAULT_CATEGORY_VOLUMES,
} from "@/lib/audio/types";

interface AudioStudioProps {
  projectId: string;
  projectTitle: string;
  initialTracks: AudioTrack[];
  initialScenes: { id: string; title: string }[];
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

const FILTERS: { label: string; value: AudioFilter }[] = [
  { label: "All Tracks", value: "all" },
  { label: "Narration", value: "narration" },
  { label: "Music", value: "music" },
  { label: "Sound FX", value: "sfx" },
  { label: "Unassigned", value: "unassigned" },
];

export function AudioStudio({
  projectId,
  projectTitle,
  initialTracks,
  initialScenes,
}: AudioStudioProps) {
  const [tracks, setTracks] = useState<AudioTrack[]>(initialTracks);
  const [filter, setFilter] = useState<AudioFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<AudioCategory>("music");
  const [uploadSceneId, setUploadSceneId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");

  // Feedback states
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deletion
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Audio Playback Engine
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flash = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 3500);
  }, []);

  // Filtered tracks
  const filteredTracks = useMemo(() => {
    let result = tracks;
    if (filter === "narration") result = result.filter((t) => t.category === "narration");
    else if (filter === "music") result = result.filter((t) => t.category === "music");
    else if (filter === "sfx") result = result.filter((t) => t.category === "sfx");
    else if (filter === "unassigned") result = result.filter((t) => !t.assignedSceneId);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((t) => t.originalFilename.toLowerCase().includes(q));
    }
    return result;
  }, [tracks, filter, searchQuery]);

  // Track stats
  const narrationCount = tracks.filter((t) => t.category === "narration").length;
  const musicCount = tracks.filter((t) => t.category === "music").length;
  const sfxCount = tracks.filter((t) => t.category === "sfx").length;

  const currentPlayingTrack = useMemo(
    () => tracks.find((t) => t.id === playingTrackId) ?? null,
    [tracks, playingTrackId],
  );

  // Audio element listeners
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsBuffering(false);
    };
    const onEnded = () => {
      if (currentPlayingTrack?.isLoop) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };

    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentPlayingTrack]);

  // Adjust audio element volume/muted when current track changes
  useEffect(() => {
    if (!audioRef.current || !currentPlayingTrack) return;
    audioRef.current.volume = currentPlayingTrack.isMuted ? 0 : currentPlayingTrack.volume / 100;
    audioRef.current.loop = currentPlayingTrack.isLoop;
  }, [currentPlayingTrack]);

  async function handlePlayTrack(track: AudioTrack) {
    if (playingTrackId === track.id) {
      if (isPlaying) {
        audioRef.current?.pause();
      } else {
        audioRef.current?.play().catch(() => {});
      }
      return;
    }

    // New track selected
    setIsBuffering(true);
    setPlayingTrackId(track.id);
    setCurrentTime(0);

    const result = await getSignedAudioUrlAction(projectId, track.id);
    if (!result.ok) {
      setError(result.error);
      setIsBuffering(false);
      return;
    }

    setPlaybackUrl(result.data.url);
    if (audioRef.current) {
      audioRef.current.src = result.data.url;
      audioRef.current.volume = track.isMuted ? 0 : track.volume / 100;
      audioRef.current.loop = track.isLoop;
      audioRef.current.play().catch((err) => {
        console.warn("Playback error:", err);
      });
    }
  }

  function handleSeek(newTime: number) {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  }

  async function handleReload() {
    setSaveState("saving");
    setError("");
    const result = await loadAudioTracks(projectId, filter);
    if (!result.ok) {
      setError(result.error);
      setSaveState("error");
      return;
    }
    setTracks(result.data.tracks);
    setSaveState("idle");
    flash("Audio library refreshed.");
  }

  async function handleUploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];

    setIsUploading(true);
    setUploadProgress(5);
    setUploadError("");

    try {
      // Step 1: Request a signed upload URL from the server (ownership verified server-side)
      const urlResult = await requestSignedAudioUploadUrl({
        projectId,
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });

      if (!urlResult.ok) {
        setUploadError(urlResult.error);
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }

      setUploadProgress(20);

      // Step 2: PUT the file binary directly to Supabase Storage — never through Next.js
      const putRes = await fetch(urlResult.data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => putRes.statusText);
        setUploadError(`Storage upload failed: ${errText}`);
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }

      setUploadProgress(80);

      // Step 3: Confirm the upload and register DB record
      const confirmResult = await confirmAudioUpload({
        projectId,
        storagePath: urlResult.data.storagePath,
        originalFilename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        category: uploadCategory,
        sceneId: uploadSceneId || null,
      });

      setUploadProgress(100);

      if (!confirmResult.ok) {
        setUploadError(confirmResult.error);
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }

      setTracks((prev) => [confirmResult.data.track, ...prev]);
      setIsUploading(false);
      setShowUploadModal(false);
      flash(`Added "${confirmResult.data.track.originalFilename}" to audio library.`);
    } catch {
      setUploadError("Audio upload failed. Please try again.");
      setIsUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleUpdateTrack(
    trackId: string,
    updates: Partial<{
      category: AudioCategory;
      volume: number;
      isMuted: boolean;
      isLoop: boolean;
      assignedSceneId: string | null;
    }>,
  ) {
    // Optimistic UI update
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
    );

    const result = await updateAudioTrack({
      projectId,
      trackId,
      ...updates,
    });

    if (!result.ok) {
      setError(result.error);
      handleReload(); // Revert
      return;
    }

    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? result.data.track : t)),
    );
  }

  async function handleDeleteTrack() {
    if (!pendingDeleteId) return;
    const deleteId = pendingDeleteId;

    if (playingTrackId === deleteId) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
      setPlaybackUrl(null);
      setIsPlaying(false);
    }

    const result = await deleteAudioTrack({ projectId, trackId: deleteId });
    setPendingDeleteId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setTracks((prev) => prev.filter((t) => t.id !== deleteId));
    flash("Audio track deleted.");
  }

  const categoryBadgeColor: Record<AudioCategory, string> = {
    narration: "rgba(168, 85, 247, 0.15)",
    music: "rgba(59, 130, 246, 0.15)",
    sfx: "rgba(245, 158, 11, 0.15)",
  };

  const categoryTextColor: Record<AudioCategory, string> = {
    narration: "#c084fc",
    music: "#60a5fa",
    sfx: "#fbbf24",
  };

  const categoryIcon: Record<AudioCategory, string> = {
    narration: "🎙",
    music: "🎵",
    sfx: "⚡",
  };

  return (
    <div className="studio">
      {/* Hidden audio element for continuous high-fidelity playback */}
      <audio ref={audioRef} preload="auto" />

      {/* Header */}
      <header className="studio-head">
        <div>
          <nav className="studio-breadcrumb" aria-label="Breadcrumb">
            <Link href="/projects">Projects</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/projects/${projectId}`}>{projectTitle}</Link>
            <span aria-hidden="true">/</span>
            <strong>Audio</strong>
          </nav>
          <h1>Audio Studio</h1>
          <p className="subtle">
            Mix voiceover narration, cinematic soundtrack, and sound effects for your scenes.
          </p>
        </div>
        <div className="studio-head-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={handleReload}
            disabled={isUploading || saveState === "saving"}
          >
            {saveState === "saving" ? "Refreshing…" : "Refresh"}
          </Button>
          <Button
            type="button"
            onClick={() => setShowUploadModal(true)}
            disabled={isUploading}
          >
            Upload audio track
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
        <Alert tone="warning" title="Audio Studio Updated">
          {notice}
        </Alert>
      )}

      {/* Production Stages Bar */}
      <nav className="studio-stages" aria-label="Production stages">
        {STAGES.map(([label, href]) => {
          const isActive = label === "Audio";
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
      <section className="studio-metrics" aria-label="Audio track statistics">
        <div className="studio-metric">
          <span>Total Audio Tracks</span>
          <strong>{String(tracks.length).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Voiceover Narration</span>
          <strong style={{ color: "#c084fc" }}>{String(narrationCount).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Background Music</span>
          <strong style={{ color: "#60a5fa" }}>{String(musicCount).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Sound Effects</span>
          <strong style={{ color: "#fbbf24" }}>{String(sfxCount).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Active Mix Status</span>
          <strong style={{ fontSize: "15px", color: isPlaying ? "var(--success)" : "var(--muted)" }}>
            {isPlaying ? "Playing Mix" : "Stopped"}
          </strong>
        </div>
      </section>

      {/* Active Player Bar (Sticky or top when playing) */}
      {currentPlayingTrack && (
        <section
          className="panel"
          style={{
            padding: "16px 20px",
            background: "var(--surface)",
            border: "1px solid var(--brand)",
            display: "flex",
            alignItems: "center",
            gap: "20px",
            flexWrap: "wrap",
            borderRadius: "12px",
          }}
        >
          <button
            type="button"
            className="vf-button"
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              padding: 0,
              display: "grid",
              placeItems: "center",
              fontSize: "18px",
              background: "var(--brand)",
              color: "#fff",
            }}
            onClick={() => handlePlayTrack(currentPlayingTrack)}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isBuffering ? "…" : isPlaying ? "⏸" : "▶"}
          </button>

          <div style={{ flex: 1, minWidth: "220px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
              <strong style={{ fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {categoryIcon[currentPlayingTrack.category]} {currentPlayingTrack.originalFilename}
              </strong>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>
                {formatDuration(currentTime)} / {formatDuration(duration || currentPlayingTrack.durationSeconds)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--brand)", cursor: "pointer" }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              type="button"
              className="vf-button secondary"
              style={{ padding: "6px 12px", fontSize: "12px" }}
              onClick={() =>
                handleUpdateTrack(currentPlayingTrack.id, {
                  isMuted: !currentPlayingTrack.isMuted,
                })
              }
            >
              {currentPlayingTrack.isMuted ? "🔇 Unmute" : "🔊 Mute"}
            </button>
            <button
              type="button"
              className="vf-button secondary"
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                background: currentPlayingTrack.isLoop ? "var(--brand-soft)" : undefined,
                borderColor: currentPlayingTrack.isLoop ? "var(--brand)" : undefined,
              }}
              onClick={() =>
                handleUpdateTrack(currentPlayingTrack.id, {
                  isLoop: !currentPlayingTrack.isLoop,
                })
              }
            >
              🔁 Loop
            </button>
          </div>
        </section>
      )}

      {/* Filter and Search Bar */}
      <section className="panel" style={{ padding: "14px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div className="project-filters" role="tablist" aria-label="Filter audio tracks by category">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={`vf-tab ${filter === f.value ? "active" : ""}`}
                role="tab"
                aria-selected={filter === f.value}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ position: "relative", width: "min(280px, 40vw)" }}>
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
              placeholder="Search audio tracks…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search audio"
              style={{ paddingLeft: "30px" }}
            />
          </div>
        </div>
      </section>

      {/* Track List */}
      {filteredTracks.length === 0 ? (
        <section
          className="panel"
          style={{
            textAlign: "center",
            padding: "54px 20px",
            border: "1px dashed var(--line)",
            borderRadius: "14px",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>🎧</div>
          <h2 style={{ fontSize: "18px", marginBottom: "6px" }}>No audio tracks found</h2>
          <p className="subtle" style={{ maxWidth: "440px", margin: "0 auto 20px" }}>
            {searchQuery || filter !== "all"
              ? "No audio tracks matched your active filters or search terms."
              : "Upload voiceover narration, soundtrack music, or audio cues to build the soundscape of this video."}
          </p>
          <Button type="button" onClick={() => setShowUploadModal(true)}>
            Upload audio track
          </Button>
        </section>
      ) : (
        <section style={{ display: "grid", gap: "12px" }} aria-label="Audio tracks list">
          {filteredTracks.map((track) => {
            const isThisPlaying = playingTrackId === track.id && isPlaying;
            return (
              <div
                key={track.id}
                className="panel"
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "20px",
                  flexWrap: "wrap",
                  borderRadius: "12px",
                  border: isThisPlaying ? "1px solid var(--brand)" : "1px solid var(--line)",
                  background: isThisPlaying ? "var(--surface)" : "var(--raised)",
                  transition: "border-color 0.2s, background 0.2s",
                }}
              >
                {/* Play Button & Details */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: "260px", flex: "1 1 300px" }}>
                  <button
                    type="button"
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      background: isThisPlaying ? "var(--brand)" : "var(--hover)",
                      color: isThisPlaying ? "#fff" : "var(--text)",
                      border: "1px solid var(--line)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "16px",
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                    onClick={() => handlePlayTrack(track)}
                    aria-label={isThisPlaying ? "Pause" : "Play audio"}
                  >
                    {isThisPlaying ? "⏸" : "▶"}
                  </button>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <strong
                        style={{
                          fontSize: "14px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "280px",
                        }}
                        title={track.originalFilename}
                      >
                        {track.originalFilename}
                      </strong>
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: "99px",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: categoryBadgeColor[track.category],
                          color: categoryTextColor[track.category],
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {categoryIcon[track.category]} {track.category}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "12px", marginTop: "4px", fontSize: "12px", color: "var(--muted)" }}>
                      <span>{(track.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                      <span>•</span>
                      <span>{formatDuration(track.durationSeconds)}</span>
                      <span>•</span>
                      <span>
                        {track.assignedSceneId
                          ? `Scene: ${initialScenes.find((s) => s.id === track.assignedSceneId)?.title || "Scene"}`
                          : "Project-wide (Global)"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mixing Controls (Volume, Scene assignment, Category, Delete) */}
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  {/* Volume Slider */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <button
                      type="button"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "16px",
                        color: track.isMuted ? "var(--warning)" : "var(--muted)",
                      }}
                      onClick={() => handleUpdateTrack(track.id, { isMuted: !track.isMuted })}
                      title={track.isMuted ? "Unmute" : "Mute"}
                    >
                      {track.isMuted ? "🔇" : "🔉"}
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={track.isMuted ? 0 : track.volume}
                      disabled={track.isMuted}
                      onChange={(e) =>
                        handleUpdateTrack(track.id, {
                          volume: Number(e.target.value),
                          isMuted: false,
                        })
                      }
                      style={{ width: "90px", accentColor: "var(--brand)", cursor: "pointer" }}
                      aria-label="Track volume"
                    />
                    <span style={{ fontSize: "12px", color: "var(--muted)", width: "32px", textAlign: "right" }}>
                      {track.isMuted ? "0%" : `${track.volume}%`}
                    </span>
                  </div>

                  {/* Loop Toggle */}
                  <button
                    type="button"
                    style={{
                      border: "1px solid var(--line)",
                      background: track.isLoop ? "var(--brand-soft)" : "transparent",
                      color: track.isLoop ? "var(--brand)" : "var(--muted)",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                    onClick={() => handleUpdateTrack(track.id, { isLoop: !track.isLoop })}
                    title={track.isLoop ? "Looping enabled" : "Looping disabled"}
                  >
                    🔁 Loop
                  </button>

                  {/* Category Dropdown */}
                  <select
                    className="vf-input"
                    value={track.category}
                    onChange={(e) =>
                      handleUpdateTrack(track.id, {
                        category: e.target.value as AudioCategory,
                      })
                    }
                    style={{ padding: "4px 8px", fontSize: "12px", width: "115px" }}
                    aria-label="Track category"
                  >
                    <option value="narration">🎙 Narration</option>
                    <option value="music">🎵 Music</option>
                    <option value="sfx">⚡ SFX</option>
                  </select>

                  {/* Scene Association Dropdown */}
                  <select
                    className="vf-input"
                    value={track.assignedSceneId ?? ""}
                    onChange={(e) =>
                      handleUpdateTrack(track.id, {
                        assignedSceneId: e.target.value || null,
                      })
                    }
                    style={{ padding: "4px 8px", fontSize: "12px", width: "150px" }}
                    aria-label="Scene assignment"
                  >
                    <option value="">Full Project (Global)</option>
                    {initialScenes.map((scene, idx) => (
                      <option key={scene.id} value={scene.id}>
                        Scene {idx + 1}: {scene.title}
                      </option>
                    ))}
                  </select>

                  {/* Delete Button */}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setPendingDeleteId(track.id)}
                    aria-label="Delete track"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Upload Audio Modal */}
      {showUploadModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            className="panel"
            style={{
              width: "100%",
              maxWidth: "480px",
              padding: "24px",
              borderRadius: "14px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "18px", margin: 0 }}>Upload Audio Track</h2>
              <button
                type="button"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--muted)",
                  fontSize: "20px",
                  cursor: "pointer",
                }}
                onClick={() => {
                  if (!isUploading) setShowUploadModal(false);
                }}
              >
                ✕
              </button>
            </div>

            {uploadError && (
              <div style={{ marginBottom: "16px" }}>
                <Alert tone="danger" title="Upload error">
                  {uploadError}
                </Alert>
              </div>
            )}

            <div style={{ display: "grid", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                  Track Category
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                  {(["music", "narration", "sfx"] as AudioCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`vf-tab ${uploadCategory === cat ? "active" : ""}`}
                      onClick={() => setUploadCategory(cat)}
                      style={{
                        padding: "8px 6px",
                        textAlign: "center",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {categoryIcon[cat]} {cat[0].toUpperCase() + cat.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                  Scene Assignment
                </label>
                <select
                  className="vf-input"
                  value={uploadSceneId}
                  onChange={(e) => setUploadSceneId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px" }}
                >
                  <option value="">Full Project (Global Background)</option>
                  {initialScenes.map((scene, idx) => (
                    <option key={scene.id} value={scene.id}>
                      Scene {idx + 1}: {scene.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                  Audio File (MP3, WAV, M4A, AAC, OGG up to 50MB)
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={AUDIO_ACCEPTED_TYPES.join(",")}
                  disabled={isUploading}
                  onChange={(e) => handleUploadFiles(e.target.files)}
                  style={{ width: "100%" }}
                />
              </div>

              {isUploading && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "4px" }}>
                    <span>Uploading track…</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div style={{ height: "6px", background: "var(--hover)", borderRadius: "99px", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${uploadProgress}%`,
                        background: "var(--brand)",
                        transition: "width 0.2s",
                      }}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowUploadModal(false)}
                  disabled={isUploading}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Delete audio track?"
        description="Are you sure you want to remove this audio file? This action will permanently remove it from storage and scene mixings."
        confirmLabel="Delete audio track"
        onConfirm={handleDeleteTrack}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/overlay";
import { Alert } from "@/components/ui/feedback";
import {
  assignAsset,
  confirmAssetUpload,
  deleteAsset,
  getSignedAssetUrl,
  loadAssets,
  removeAssetAssignment,
  requestSignedUploadUrl,
} from "@/app/projects/[id]/assets/actions";

import {
  formatFileSize,
  type AssetFilter,
  type AssetMediaType,
  type AssetRecord,
} from "@/lib/assets/types";

interface AssetStudioProps {
  projectId: string;
  projectTitle: string;
  initialAssets: AssetRecord[];
  initialTotalSizeBytes: number;
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

const FILTERS: { label: string; value: AssetFilter }[] = [
  { label: "All", value: "all" },
  { label: "Images", value: "image" },
  { label: "Videos", value: "video" },
  { label: "Audio", value: "audio" },
  { label: "Unassigned", value: "unassigned" },
];

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime", "audio/mpeg", "audio/wav", "audio/mp4", "audio/x-m4a"];

const MAX_FILE_SIZE = 50 * 1024 * 1024;

type SaveState = "idle" | "saving" | "saved" | "error";

export function AssetStudio({
  projectId,
  projectTitle,
  initialAssets,
  initialTotalSizeBytes,
  initialScenes,
}: AssetStudioProps) {
  const [assets, setAssets] = useState<AssetRecord[]>(initialAssets);
  const [totalSizeBytes, setTotalSizeBytes] = useState(initialTotalSizeBytes);
  const [filter, setFilter] = useState<AssetFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  const filteredAssets = useMemo(() => {
    let result = assets;
    if (filter === "image") result = result.filter((a) => a.mediaType === "image");
    else if (filter === "video") result = result.filter((a) => a.mediaType === "video");
    else if (filter === "audio") result = result.filter((a) => a.mediaType === "audio");
    else if (filter === "unassigned") result = result.filter((a) => !a.assignedSceneId);

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((a) => a.originalFilename.toLowerCase().includes(q));
    }
    return result;
  }, [assets, filter, searchQuery]);

  const sceneCount = initialScenes.length;
  const assignedCount = assets.filter((a) => a.assignedSceneId).length;

  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);

  async function handleReload() {
    setSaveState("saving");
    setError("");
    setNotice("");
    try {
      const result = await loadAssets(projectId, filter, searchQuery);
      if (!result.ok) {
        setSaveState("error");
        setError(result.error);
        return;
      }
      setAssets(result.data.assets);
      setTotalSizeBytes(result.data.totalSizeBytes);
      setSaveState("saved");
      flash("Assets refreshed.");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      setError("Could not reload assets.");
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return;
    const file = files[0];
    setUploadError("");
    setIsUploading(true);
    setUploadProgress(5);

    try {
      // Step 1: Request a signed upload URL from the server (ownership check happens here)
      const urlResult = await requestSignedUploadUrl({
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

      // Step 3: Confirm the upload and register the asset record in the DB
      const confirmResult = await confirmAssetUpload({
        projectId,
        storagePath: urlResult.data.storagePath,
        originalFilename: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });

      setUploadProgress(100);

      if (!confirmResult.ok) {
        setUploadError(confirmResult.error);
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }

      setAssets((current) => [confirmResult.data.asset, ...current]);
      flash("Asset uploaded.");
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        handleReload();
      }, 600);
    } catch {
      setUploadError("Upload failed. Please try again.");
      setIsUploading(false);
      setUploadProgress(0);
    }
  }

  async function handleAssign(assetId: string, sceneId: string | null) {
    setSaveState("saving");
    setError("");
    const input = { projectId, assetId, sceneId };
    const result = sceneId
      ? await assignAsset(input)
      : await removeAssetAssignment(input);
    if (!result.ok) {
      setSaveState("error");
      setError(result.error);
      return;
    }
    setAssets((current) =>
      current.map((a) => (a.id === assetId ? result.data.asset : a)),
    );
    setSaveState("saved");
    flash(sceneId ? "Asset assigned to scene." : "Assignment removed.");
    setTimeout(() => setSaveState("idle"), 2000);
  }

  async function handleDelete() {
    if (!pendingDeleteId) return;
    const result = await deleteAsset({ projectId, assetId: pendingDeleteId });
    if (!result.ok) {
      setError(result.error);
      setPendingDeleteId(null);
      return;
    }
    setAssets((current) => current.filter((a) => a.id !== pendingDeleteId));
    if (selectedAssetId === pendingDeleteId) handleAssetSelect(null);
    setPendingDeleteId(null);
    flash("Asset deleted.");
    handleReload();
  }

  const handleAssetSelect = useCallback((asset: AssetRecord | null) => {
    setSelectedAssetId(asset?.id ?? null);
    if (asset) {
      setPreviewLoading(true);
      setPreviewUrl(null);
      getSignedAssetUrl(projectId, asset.id).then((result) => {
        if (result.ok) {
          setPreviewUrl(result.data.url);
        }
        setPreviewLoading(false);
      });
    } else {
      setPreviewUrl(null);
      setPreviewLoading(false);
    }
  }, [projectId]);

  const mediaIcon = (type: AssetMediaType) => {
    if (type === "image") return "🖼";
    if (type === "video") return "🎬";
    return "🎵";
  };

  return (
    <div className="studio">
      <header className="studio-head">
        <div>
          <nav className="studio-breadcrumb" aria-label="Breadcrumb">
            <Link href="/projects">Projects</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/projects/${projectId}`}>{projectTitle}</Link>
            <span aria-hidden="true">/</span>
            <strong>Assets</strong>
          </nav>
          <h1>Asset Studio</h1>
          <p className="subtle">
            Upload and manage the images, videos, and audio for this project.
          </p>
        </div>
        <div className="studio-head-actions">
          <Button type="button" variant="secondary" onClick={handleReload} disabled={isUploading || saveState === "saving"}>
            {saveState === "saving" ? "Refreshing…" : "Refresh"}
          </Button>
          <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? `Uploading… ${uploadProgress}%` : "Upload asset"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            onChange={(e) => handleUpload(e.target.files)}
            style={{ display: "none" }}
          />
        </div>
      </header>

      {error && (
        <Alert tone="danger" title="Something went wrong">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="warning" title="Updated">
          {notice}
        </Alert>
      )}
      {uploadError && (
        <Alert tone="danger" title="Upload failed">
          {uploadError}
        </Alert>
      )}

      <nav className="studio-stages" aria-label="Production stages">
        {STAGES.map(([label, href]) => {
          const isActive = label === "Assets";
          const isScript = label === "Script";
          const projectHref = `/projects/${projectId}/${href}`;
          if (isScript) {
            return (
              <Link key={label} href={`/projects/${projectId}/script`} className={`studio-stage ${isActive ? "active" : ""}`}>
                {label}
              </Link>
            );
          }
          return (
            <Link key={label} href={projectHref} className={`studio-stage ${isActive ? "active" : ""}`} aria-current={isActive ? "page" : undefined}>
              {label}
            </Link>
          );
        })}
      </nav>

      <section className="studio-metrics" aria-label="Asset statistics">
        <div className="studio-metric">
          <span>Total assets</span>
          <strong>{String(assets.length).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Assigned to scenes</span>
          <strong>{String(assignedCount).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Scenes</span>
          <strong>{String(sceneCount).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Storage used</span>
          <strong>{formatFileSize(totalSizeBytes)}</strong>
        </div>
      </section>

      <section className="panel" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
          <div className="project-filters" role="tablist" aria-label="Filter assets by type">
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
            <span className="search-icon" aria-hidden="true" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}>⌕</span>
            <input
              type="search"
              className="vf-input"
              placeholder="Search assets…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search assets"
              style={{ paddingLeft: "30px" }}
            />
          </div>
        </div>
      </section>

      <div className="studio-grid" style={{ alignItems: "start" }}>
        <div style={{ display: "grid", gap: "14px" }}>
          {isUploading && (
            <div className="panel" style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="vf-progress" style={{ flex: 1 }}>
                  <span style={{ width: `${uploadProgress}%` }} />
                </div>
                <span className="subtle" style={{ fontSize: "12px" }}>{uploadProgress}%</span>
              </div>
            </div>
          )}

          {filteredAssets.length === 0 && !isUploading ? (
            <section className="panel card vf-empty" aria-live="polite">
              <h2>{searchQuery || filter !== "all" ? "No assets found" : "No assets yet"}</h2>
              <p>
                {searchQuery || filter !== "all"
                  ? "Try adjusting your search or filters."
                  : "Upload images, videos, or audio files to get started."}
              </p>
              {!searchQuery && filter === "all" && (
                <div style={{ marginTop: "16px" }}>
                  <Button type="button" onClick={() => fileInputRef.current?.click()}>
                    Upload your first asset
                  </Button>
                </div>
              )}
            </section>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: "12px",
              }}
            >
              {filteredAssets.map((asset) => {
                const isSelected = selectedAssetId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`panel ${isSelected ? "studio-scene-chip active" : ""}`}
                    style={{
                      padding: 0,
                      overflow: "hidden",
                      cursor: "pointer",
                      textAlign: "left",
                      border: isSelected ? "1.5px solid var(--brand)" : "1px solid var(--line)",
                      transition: ".15s",
                    }}
                    onClick={() => handleAssetSelect(isSelected ? null : asset)}
                    aria-pressed={isSelected}
                  >
                    <div
                      style={{
                        height: "120px",
                        display: "grid",
                        placeItems: "center",
                        background: "var(--raised)",
                        color: "var(--muted)",
                        fontSize: "32px",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      {asset.mediaType === "image" && previewUrl && isSelected ? (
                        <img
                          src={previewUrl}
                          alt={asset.originalFilename}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : asset.mediaType === "video" && previewUrl && isSelected ? (
                        <video
                          src={previewUrl}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          muted
                        />
                      ) : (
                        <span aria-hidden="true">{mediaIcon(asset.mediaType)}</span>
                      )}
                      <span
                        className="vf-badge"
                        style={{
                          position: "absolute",
                          top: "8px",
                          right: "8px",
                          fontSize: "10px",
                          padding: "2px 6px",
                          textTransform: "capitalize",
                        }}
                      >
                        {asset.mediaType}
                      </span>
                    </div>
                    <div style={{ padding: "10px 12px" }}>
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: "12px",
                          fontWeight: 700,
                          color: "var(--text)",
                        }}
                        title={asset.originalFilename}
                      >
                        {asset.originalFilename}
                      </div>
                      <div style={{ display: "flex", gap: "8px", marginTop: "5px", color: "var(--muted)", fontSize: "11px", flexWrap: "wrap" }}>
                        <span>{formatFileSize(asset.fileSize)}</span>
                        {asset.width && asset.height && <span>{asset.width}×{asset.height}</span>}
                        {asset.durationSeconds && <span>· {Math.round(asset.durationSeconds)}s</span>}
                      </div>
                      {asset.assignedSceneId && (
                        <div style={{ marginTop: "5px" }}>
                          <span className="vf-badge success" style={{ fontSize: "10px", padding: "2px 6px" }}>
                            Scene: {initialScenes.find((s) => s.id === asset.assignedSceneId)?.title ?? asset.assignedSceneId}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedAsset && (
          <aside className="panel" style={{ padding: "16px", position: "sticky", top: "18px" }} aria-label="Asset details">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
              <strong style={{ fontSize: "14px" }}>Asset details</strong>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => handleAssetSelect(null)}
                aria-label="Close details panel"
              >
                ✕
              </Button>
            </div>

            <div
              style={{
                height: "180px",
                display: "grid",
                placeItems: "center",
                background: "var(--raised)",
                borderRadius: "10px",
                overflow: "hidden",
                marginBottom: "14px",
                color: "var(--muted)",
                fontSize: "40px",
              }}
            >
              {previewLoading ? (
                <span className="studio-chip-spinner" style={{ width: "24px", height: "24px", borderWidth: "3px" }} aria-label="Loading preview" />
              ) : previewUrl ? (
                selectedAsset.mediaType === "image" ? (
                  <img src={previewUrl} alt={selectedAsset.originalFilename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <video src={previewUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted controls />
                )
              ) : (
                <span aria-hidden="true">{mediaIcon(selectedAsset.mediaType)}</span>
              )}
            </div>

            <div style={{ display: "grid", gap: "10px", fontSize: "13px" }}>
              <div>
                <span style={{ display: "block", fontSize: "10px", color: "var(--muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "3px" }}>Filename</span>
                <strong style={{ wordBreak: "break-all" }}>{selectedAsset.originalFilename}</strong>
              </div>
              <div>
                <span style={{ display: "block", fontSize: "10px", color: "var(--muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "3px" }}>Type</span>
                <span className="vf-badge" style={{ textTransform: "capitalize" }}>{selectedAsset.mediaType}</span>
                <span style={{ marginLeft: "6px", color: "var(--muted)", fontSize: "11px" }}>{selectedAsset.mimeType}</span>
              </div>
              {(selectedAsset.width && selectedAsset.height) && (
                <div>
                  <span style={{ display: "block", fontSize: "10px", color: "var(--muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "3px" }}>Dimensions</span>
                  <strong>{selectedAsset.width} × {selectedAsset.height}</strong>
                </div>
              )}
              <div>
                <span style={{ display: "block", fontSize: "10px", color: "var(--muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "3px" }}>Size</span>
                <strong>{formatFileSize(selectedAsset.fileSize)}</strong>
              </div>
              {selectedAsset.durationSeconds && (
                <div>
                  <span style={{ display: "block", fontSize: "10px", color: "var(--muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "3px" }}>Duration</span>
                  <strong>{Math.round(selectedAsset.durationSeconds)}s</strong>
                </div>
              )}
              <div>
                <span style={{ display: "block", fontSize: "10px", color: "var(--muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "3px" }}>Scene assignment</span>
                {selectedAsset.assignedSceneId ? (
                  <span className="vf-badge success">
                    {initialScenes.find((s) => s.id === selectedAsset.assignedSceneId)?.title ?? selectedAsset.assignedSceneId}
                  </span>
                ) : (
                  <span style={{ color: "var(--muted)" }}>Unassigned</span>
                )}
              </div>
              <div>
                <span style={{ display: "block", fontSize: "10px", color: "var(--muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "3px" }}>Created</span>
                <strong>{new Date(selectedAsset.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</strong>
              </div>
            </div>

            <div style={{ display: "grid", gap: "8px", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid var(--line)" }}>
              <span style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase" }}>Assign to scene</span>
              <select
                className="vf-select"
                value={selectedAsset.assignedSceneId ?? ""}
                onChange={(e) => handleAssign(selectedAsset.id, e.target.value || null)}
                aria-label="Assign scene"
                style={{ fontSize: "12px" }}
              >
                <option value="">— Unassigned —</option>
                {initialScenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    Scene {initialScenes.findIndex((s) => s.id === scene.id) + 1}: {scene.title}
                  </option>
                ))}
              </select>
              {selectedAsset.assignedSceneId && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleAssign(selectedAsset.id, null)}
                >
                  Remove assignment
                </Button>
              )}
              <div style={{ display: "grid", gap: "8px", marginTop: "4px" }}>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  onClick={() => setPendingDeleteId(selectedAsset.id)}
                >
                  Delete asset
                </Button>
              </div>
            </div>
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Delete this asset?"
        description={`“{pendingDeleteId ? assets.find((a) => a.id === pendingDeleteId)?.originalFilename ?? "this asset" : ""}” will be permanently removed from this project.`}
        confirmLabel="Delete asset"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

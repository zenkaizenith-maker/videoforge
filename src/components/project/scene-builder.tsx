"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-fields";
import { Alert } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import {
  countWords,
  createScene,
  estimateNarrationSeconds,
  formatDurationLabel,
  getScriptStats,
  type ScriptDocument,
  type ScriptScene,
} from "@/lib/scripts/script-document";
import {
  addScene,
  deleteScene,
  duplicateScene,
  loadScenesDocument,
  moveScene,
  regenerateScene,
  saveScenesDocument,
} from "@/app/projects/[id]/scenes/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

interface SceneBuilderProps {
  projectId: string;
  projectTitle: string;
  initialDocument: ScriptDocument;
  initialVersion: number;
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

export function SceneBuilder({
  projectId,
  projectTitle,
  initialDocument,
  initialVersion,
}: SceneBuilderProps) {
  const [document, setDocument] = useState<ScriptDocument>(initialDocument);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify(initialDocument));
  const [version, setVersion] = useState(initialVersion);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeSceneId, setActiveSceneId] = useState<string>(initialDocument.scenes[0]?.id ?? "");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busySceneId, setBusySceneId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [regenerateDirections, setRegenerateDirections] = useState<Record<string, string>>({});
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stats = useMemo(() => getScriptStats(document), [document]);
  const isDirty = useMemo(() => JSON.stringify(document) !== savedSnapshot, [document, savedSnapshot]);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);

  function truncate(value: string, max = 52) {
    if (value.length <= max) return value;
    return value.slice(0, max).trimEnd() + "…";
  }

  function updateScene(id: string, patch: Partial<ScriptScene>) {
    setDocument((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => (scene.id === id ? { ...scene, ...patch } : scene)),
    }));
    setSaveState("idle");
  }

  async function handleSave() {
    setSaveState("saving");
    setError("");
    setNotice("");
    const result = await saveScenesDocument({ projectId, document });
    if (!result.ok) {
      setSaveState("error");
      setError(result.error);
      return;
    }
    setDocument(result.data.document);
    setSavedSnapshot(JSON.stringify(result.data.document));
    setVersion(result.data.version);
    setSaveState("saved");
    flash("Scene changes saved.");
  }

  async function handleAddScene() {
    setSaveState("idle");
    setError("");
    setNotice("");
    const result = await addScene(projectId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDocument((current) => ({ ...current, scenes: [...current.scenes, result.data.scene] }));
    setActiveSceneId(result.data.scene.id);
    flash("Scene added.");
  }

  async function handleDuplicateScene() {
    if (!activeSceneId) return;
    setSaveState("idle");
    setError("");
    setNotice("");
    const result = await duplicateScene(projectId, activeSceneId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDocument((current) => ({
      ...current,
      scenes: [...current.scenes, result.data.scene],
    }));
    setActiveSceneId(result.data.scene.id);
    flash("Scene duplicated.");
  }

  async function handleDeleteScene() {
    if (!pendingDeleteId) return;
    const result = await deleteScene(projectId, pendingDeleteId);
    if (!result.ok) {
      setError(result.error);
      setPendingDeleteId(null);
      return;
    }
    setDocument(result.data.document);
    const remaining = result.data.document.scenes;
    setActiveSceneId(remaining[0]?.id ?? "");
    setPendingDeleteId(null);
    setSaveState("idle");
    flash("Scene deleted.");
  }

  async function handleMoveScene(direction: -1 | 1) {
    if (!activeSceneId) return;
    setSaveState("idle");
    setError("");
    setNotice("");
    const result = await moveScene(projectId, activeSceneId, direction);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDocument(result.data.document);
  }

  async function handleRegenerate(scene: ScriptScene) {
    setBusySceneId(scene.id);
    setError("");
    setNotice("");
    const result = await regenerateScene(
      projectId,
      scene,
      regenerateDirections[scene.id],
    );
    setBusySceneId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const next = result.data.scene;
    setDocument((current) => ({
      ...current,
      scenes: current.scenes.map((item) => (item.id === next.id ? next : item)),
    }));
    setSaveState("idle");
    flash(
      result.data.mode === "demo"
        ? "Demo rewrite applied from the local placeholder provider."
        : "Scene rewritten. Save to keep it.",
    );
  }

  async function handleReload() {
    setIsLoading(true);
    setError("");
    setNotice("");
    const result = await loadScenesDocument(projectId);
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDocument(result.data.document);
    setSavedSnapshot(JSON.stringify(result.data.document));
    setVersion(result.data.version);
    setActiveSceneId(result.data.document.scenes[0]?.id ?? "");
    setSaveState("idle");
  }

  const activeScene = document.scenes.find((scene) => scene.id === activeSceneId) ?? document.scenes[0];
  const activeIndex = activeScene ? document.scenes.findIndex((scene) => scene.id === activeScene.id) : -1;

  return (
    <div className="studio">
      <header className="studio-head">
        <div>
          <nav className="studio-breadcrumb" aria-label="Breadcrumb">
            <Link href="/projects">Projects</Link>
            <span aria-hidden="true">/</span>
            <Link href={`/projects/${projectId}`}>{projectTitle}</Link>
            <span aria-hidden="true">/</span>
            <strong>Scenes</strong>
          </nav>
          <h1>Scene Builder</h1>
          <p className="subtle">
            Arrange, refine, and manage every scene in this video. Changes are stored on the same script document
            used by Script Studio.
          </p>
        </div>
        <div className="studio-head-actions">
          <Button type="button" variant="secondary" onClick={handleReload} disabled={isLoading}>
            {isLoading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saveState === "saving" || busySceneId !== null}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" && !isDirty ? "Saved" : "Save changes"}
          </Button>
        </div>
      </header>

      {error && (
        <Alert tone="danger" title="The scene could not be updated">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="warning" title="Updated">
          {notice}
        </Alert>
      )}

      <nav className="studio-stages" aria-label="Production stages">
        {STAGES.map(([label, href]) => {
          const isActive = label === "Scenes";
          const isAccessible = true;
          const targetHref =
            href === "script"
              ? `/projects/${projectId}/script`
              : `/projects/${projectId}/${href}`;
          if (isAccessible) {
            return (
              <Link
                key={label}
                href={targetHref}
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

      <section className="studio-metrics" aria-label="Scene statistics">
        <div className="studio-metric">
          <span>Scenes</span>
          <strong>{String(stats.sceneCount).padStart(2, "0")}</strong>
        </div>
        <div className="studio-metric">
          <span>Word count</span>
          <strong>{stats.wordCount}</strong>
        </div>
        <div className="studio-metric">
          <span>Estimated duration</span>
          <strong>{formatDurationLabel(stats.totalDurationSeconds)}</strong>
        </div>
        <div className="studio-metric">
          <span>Narration length</span>
          <strong>{formatDurationLabel(stats.narrationDurationSeconds)}</strong>
        </div>
      </section>

      <div className="studio-grid">
        <aside className="panel studio-outline" aria-label="Scene outline">
          <div className="studio-outline-head">
            <h2>Scenes</h2>
            <Button type="button" size="sm" variant="secondary" onClick={handleAddScene}>
              + Add
            </Button>
          </div>

          <ol className="studio-scene-list">
            {document.scenes.map((scene, index) => {
              const isActive = activeScene?.id === scene.id;
              return (
                <li key={scene.id}>
                  <button
                    type="button"
                    className={`studio-scene-chip ${isActive ? "active" : ""}`}
                    onClick={() => setActiveSceneId(scene.id)}
                    aria-current={isActive}
                  >
                    <span className="studio-scene-chip-index">{index + 1}</span>
                    <span className="studio-scene-chip-body">
                      <strong>{scene.title || "Untitled scene"}</strong>
                      <small>
                        {truncate(scene.narration.replace(/\s+/g, " ").trim()) || "No narration yet"} ·{" "}
                        {formatDurationLabel(scene.estimatedDurationSeconds)}
                      </small>
                    </span>
                    {busySceneId === scene.id && <span className="studio-chip-spinner" aria-label="Working" />}
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="studio-generate">
            <span className="studio-generate-label">Script</span>
            <div className="studio-generate-row">
              <Link href={`/projects/${projectId}/script`} className="vf-button secondary" style={{ width: "100%" }}>
                Open Script Studio
              </Link>
            </div>
          </div>
        </aside>

        <div className="studio-editor">
          {activeScene ? (
            <section className="panel studio-scene-editor">
              <div className="studio-scene-editor-head">
                <div>
                  <span className="studio-overline">Scene {activeIndex + 1} of {document.scenes.length}</span>
                  <h2>{activeScene.title || "Untitled scene"}</h2>
                </div>
                <div className="studio-scene-tools">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleMoveScene(-1)}
                    disabled={activeIndex === 0}
                    aria-label="Move scene up"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleMoveScene(1)}
                    disabled={activeIndex === document.scenes.length - 1}
                    aria-label="Move scene down"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setPendingDeleteId(activeScene.id)}
                    disabled={document.scenes.length <= 1}
                  >
                    Delete
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleDuplicateScene}
                    disabled={busySceneId === activeScene.id}
                  >
                    Duplicate
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleRegenerate(activeScene)}
                    disabled={busySceneId === activeScene.id}
                  >
                    {busySceneId === activeScene.id ? "Rewriting…" : "↻ Regenerate"}
                  </Button>
                </div>
              </div>

              <div className="studio-scene-body">
                <Field label="Scene title">
                  <Input
                    value={activeScene.title}
                    onChange={(event) => updateScene(activeScene.id, { title: event.target.value })}
                    placeholder="e.g. The Cold Open"
                  />
                </Field>

                <Field label="Narration">
                  <Textarea
                    rows={6}
                    value={activeScene.narration}
                    onChange={(event) => updateScene(activeScene.id, { narration: event.target.value })}
                    placeholder="Write exactly what the voice will say. No stage directions."
                  />
                </Field>
                <div className="studio-field-foot">
                  <span className="subtle">{countWords(activeScene.narration)} words</span>
                  <span className="subtle">
                    ≈ {formatDurationLabel(estimateNarrationSeconds(activeScene.narration))} spoken
                  </span>
                </div>

                <Field label="Visual direction">
                  <Textarea
                    rows={4}
                    value={activeScene.visualDirection}
                    onChange={(event) => updateScene(activeScene.id, { visualDirection: event.target.value })}
                    placeholder="What the viewer sees: framing, subject, motion, lighting, graphic treatment."
                  />
                </Field>

                <Field label="Estimated duration (seconds)">
                  <Input
                    type="number"
                    min={1}
                    max={600}
                    value={activeScene.estimatedDurationSeconds}
                    onChange={(event) => {
                      const next = Number.parseInt(event.target.value, 10);
                      updateScene(activeScene.id, {
                        estimatedDurationSeconds: Number.isNaN(next)
                          ? 1
                          : Math.min(600, Math.max(1, next)),
                      });
                    }}
                  />
                </Field>

                <details className="studio-regenerate">
                  <summary>Give the AI a direction before rewriting this scene</summary>
                  <Textarea
                    rows={3}
                    value={regenerateDirections[activeScene.id] ?? ""}
                    onChange={(event) =>
                      setRegenerateDirections((current) => ({ ...current, [activeScene.id]: event.target.value }))
                    }
                    placeholder="e.g. Sharper opening line, less jargon, end on a question."
                  />
                  <div className="studio-regenerate-actions">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleRegenerate(activeScene)}
                      disabled={busySceneId === activeScene.id}
                    >
                      Rewrite this scene
                    </Button>
                  </div>
                </details>
              </div>
            </section>
          ) : (
            <section className="panel card vf-empty">
              <h2>No scenes yet</h2>
              <p>Add a scene to start, or open Script Studio to generate a full script.</p>
              <div style={{ marginTop: "16px" }}>
                <Link className="vf-button primary" href={`/projects/${projectId}/script`}>
                  Open Script Studio
                </Link>
              </div>
            </section>
          )}

          <section className="panel studio-foot-actions">
            <div>
              <strong>{isDirty ? "Unsaved changes" : "Everything is saved"}</strong>
              <p className="subtle">
                {isDirty
                  ? "Saving overwrites the stored script and increments its version."
                  : `Stored as version ${version} on this project.`}
              </p>
            </div>
            <Button type="button" onClick={handleSave} disabled={saveState === "saving" || busySceneId !== null}>
              {saveState === "saving" ? "Saving…" : "Save changes"}
            </Button>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Delete this scene?"
        description={`“${activeScene?.title || "Untitled scene"}” will be removed from the script. Save to make it permanent.`}
        confirmLabel="Delete scene"
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={handleDeleteScene}
      />
    </div>
  );
}

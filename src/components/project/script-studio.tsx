"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form-fields";
import { Alert, Badge, ProgressBar } from "@/components/ui/feedback";
import { ConfirmDialog } from "@/components/ui/overlay";
import {
  countWords,
  createScene,
  estimateNarrationSeconds,
  formatClock,
  formatDurationLabel,
  getScriptStats,
  type ScriptDocument,
  type ScriptScene,
} from "@/lib/scripts/script-document";
import {
  generateScriptDocument,
  regenerateScriptScene,
  saveScriptDocument,
} from "@/app/projects/[id]/script/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

interface ScriptStudioProps {
  projectId: string;
  initialDocument: ScriptDocument;
  initialVersion: number;
  providerName: string;
  providerMode: "live" | "demo";
  providerConfigured?: boolean;
  providerNotice?: string;
  targetDurationSeconds: number;
  aspectRatio: string;
  visualStyle: string;
  voiceStyle: string;
}

const SCENE_COUNT_OPTIONS = [3, 4, 5, 6, 7, 8];

export function ScriptStudio({
  projectId,
  initialDocument,
  initialVersion,
  providerName,
  providerMode,
  providerConfigured = true,
  providerNotice,
  targetDurationSeconds,
  aspectRatio,
  visualStyle,
  voiceStyle,
}: ScriptStudioProps) {
  const [document, setDocument] = useState<ScriptDocument>(initialDocument);
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify(initialDocument));
  const [version, setVersion] = useState(initialVersion);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeSceneId, setActiveSceneId] = useState<string>(initialDocument.scenes[0]?.id ?? "");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busySceneId, setBusySceneId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateSceneCount, setGenerateSceneCount] = useState(Math.min(6, Math.max(3, initialDocument.scenes.length)));
  const [regenerateDirections, setRegenerateDirections] = useState<Record<string, string>>({});
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stats = useMemo(() => getScriptStats(document), [document]);
  const isDirty = useMemo(() => JSON.stringify(document) !== savedSnapshot, [document, savedSnapshot]);
  const overRuntime = stats.totalDurationSeconds > targetDurationSeconds;

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  }, []);

  function updateScene(id: string, patch: Partial<ScriptScene>) {
    setDocument((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => (scene.id === id ? { ...scene, ...patch } : scene)),
    }));
    setSaveState("idle");
  }

  function moveScene(id: string, direction: -1 | 1) {
    setDocument((current) => {
      const index = current.scenes.findIndex((scene) => scene.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.scenes.length) return current;
      const scenes = [...current.scenes];
      [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
      return { ...current, scenes };
    });
    setSaveState("idle");
  }

  function addScene() {
    const scene = createScene({ estimatedDurationSeconds: 10 });
    setDocument((current) => ({ ...current, scenes: [...current.scenes, scene] }));
    setActiveSceneId(scene.id);
    setSaveState("idle");
  }

  function removeScene() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setDocument((current) => {
      const scenes = current.scenes.filter((scene) => scene.id !== id);
      return { ...current, scenes: scenes.length ? scenes : [createScene()] };
    });
    if (activeSceneId === id) {
      const remaining = document.scenes.filter((scene) => scene.id !== id);
      setActiveSceneId(remaining[0]?.id ?? "");
    }
    setPendingDeleteId(null);
    setSaveState("idle");
  }

  async function handleSave() {
    setSaveState("saving");
    setError("");
    setNotice("");
    const result = await saveScriptDocument({ projectId, document });
    if (!result.ok) {
      setSaveState("error");
      setError(result.error);
      return;
    }
    setDocument(result.data.document);
    setSavedSnapshot(JSON.stringify(result.data.document));
    setVersion(result.data.version);
    setSaveState("saved");
    flash("Script saved to this project.");
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError("");
    setNotice("");
    const result = await generateScriptDocument({ projectId, sceneCount: generateSceneCount });
    setIsGenerating(false);
    if (!result.ok) {
      setSaveState("error");
      setError(result.error);
      return;
    }
    setDocument(result.data.document);
    setSavedSnapshot(JSON.stringify(result.data.document));
    setVersion(result.data.version);
    setSaveState("saved");
    setActiveSceneId(result.data.document.scenes[0]?.id ?? "");
    flash(
      result.data.mode === "demo"
        ? "Demo draft loaded from the local placeholder provider."
        : "New script generated and saved.",
    );
  }

  async function handleRegenerate(scene: ScriptScene) {
    setBusySceneId(scene.id);
    setError("");
    setNotice("");
    const result = await regenerateScriptScene({
      projectId,
      scene,
      direction: regenerateDirections[scene.id],
    });
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

  const activeScene = document.scenes.find((scene) => scene.id === activeSceneId) ?? document.scenes[0];
  const activeIndex = activeScene ? document.scenes.findIndex((scene) => scene.id === activeScene.id) : -1;

  return (
    <div className="studio">
      <header className="studio-head">
        <div>
          <div className="eyebrow">Script Studio</div>
          <h1>Write the narration that carries this video.</h1>
          <p className="subtle">
            Every edit stays local until you save. The script is stored on your own project record — scene
            planning, media, and rendering come later.
          </p>
        </div>
        <div className="studio-head-actions">
          <Badge tone={providerMode === "demo" || !providerConfigured ? "warning" : "success"}>
            {providerMode === "demo"
              ? "Demo provider"
              : providerConfigured
              ? `AI · ${providerName}`
              : "AI provider not configured"}
          </Badge>
          <Button type="button" variant="secondary" onClick={handleSave} disabled={saveState === "saving" || isGenerating}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" && !isDirty ? "Saved" : "Save changes"}
          </Button>
        </div>
      </header>

      {providerNotice && (
        <Alert tone="warning" title="Script provider configuration">
          {providerNotice}
        </Alert>
      )}

      {error && (
        <Alert tone="danger" title="The script could not be updated">
          {error}
        </Alert>
      )}
      {notice && (
        <Alert tone="warning" title={providerMode === "live" ? "Updated" : "Demo mode"}>
          {notice}
        </Alert>
      )}

      <section className="studio-metrics" aria-label="Script statistics">
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
        <div className="studio-metric">
          <span>Target runtime</span>
          <strong>{formatDurationLabel(targetDurationSeconds)}</strong>
        </div>
      </section>

      <section className="panel studio-runtime">
        <div className="studio-runtime-head">
          <span className="studio-runtime-label">
            Runtime vs target · {formatDurationLabel(stats.totalDurationSeconds)} of {formatDurationLabel(targetDurationSeconds)}
          </span>
          <span className={overRuntime ? "studio-runtime-delta over" : "studio-runtime-delta"}>
            {overRuntime
              ? `${formatDurationLabel(stats.totalDurationSeconds - targetDurationSeconds)} over`
              : `${formatDurationLabel(targetDurationSeconds - stats.totalDurationSeconds)} of headroom`}
          </span>
        </div>
        <ProgressBar
          value={(stats.totalDurationSeconds / Math.max(1, targetDurationSeconds)) * 100}
          label="Estimated runtime against the target"
        />
      </section>

      <section className="panel studio-brief">
        <div className="studio-brief-grid">
          <div><span>Aspect ratio</span><strong>{aspectRatio}</strong></div>
          <div><span>Visual style</span><strong>{visualStyle}</strong></div>
          <div><span>Narration voice</span><strong>{voiceStyle}</strong></div>
          <div><span>Script version</span><strong>v{version}</strong></div>
        </div>
      </section>

      <div className="studio-grid">
        <aside className="panel studio-outline" aria-label="Scene outline">
          <div className="studio-outline-head">
            <h2>Scenes</h2>
            <Button type="button" size="sm" variant="secondary" onClick={addScene}>
              + Add scene
            </Button>
          </div>

          <ol className="studio-scene-list">
            {document.scenes.map((scene, index) => {
              const start = document.scenes
                .slice(0, index)
                .reduce((total, item) => total + item.estimatedDurationSeconds, 0);
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
                        {formatClock(start)} · {countWords(scene.narration)} words ·{" "}
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
            <span className="studio-generate-label">Generate a full script</span>
            <div className="studio-generate-row">
              <select
                className="vf-select"
                value={generateSceneCount}
                onChange={(event) => setGenerateSceneCount(Number(event.target.value))}
                aria-label="Scene count for a generated script"
                disabled={isGenerating}
              >
                {SCENE_COUNT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count} scenes
                  </option>
                ))}
              </select>
              <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
                {isGenerating ? "Generating…" : "Regenerate script"}
              </Button>
            </div>
            {providerMode === "demo" && (
              <p className="studio-generate-hint subtle">
                SCRIPT_PROVIDER_MODE is set to <code>demo</code>, so this fills in with the labelled local
                placeholder provider instead of a real model.
              </p>
            )}
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
                    onClick={() => moveScene(activeScene.id, -1)}
                    disabled={activeIndex === 0}
                    aria-label="Move scene up"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => moveScene(activeScene.id, 1)}
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
                    disabled={document.scenes.length === 1}
                  >
                    Delete
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleRegenerate(activeScene)}
                    disabled={busySceneId === activeScene.id || isGenerating}
                  >
                    {busySceneId === activeScene.id ? "Rewriting…" : "↻ Regenerate scene"}
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
                    <Button type="button" size="sm" onClick={() => handleRegenerate(activeScene)} disabled={busySceneId === activeScene.id}>
                      Rewrite this scene
                    </Button>
                  </div>
                </details>
              </div>
            </section>
          ) : (
            <section className="panel card vf-empty">
              <h2>No scenes yet</h2>
              <p>Add a scene to start writing, or generate a full script from your project brief.</p>
            </section>
          )}

          <section className="panel studio-hooks">
            <div className="studio-hooks-head">
              <div>
                <span className="studio-overline">Cold open</span>
                <h2>Hook</h2>
              </div>
              <Badge>{countWords(document.hook)} words · ≈ {formatDurationLabel(estimateNarrationSeconds(document.hook))}</Badge>
            </div>
            <Field label="Spoken hook — what lands before the first scene">
              <Textarea
                rows={4}
                value={document.hook}
                onChange={(event) => {
                  setDocument((current) => ({ ...current, hook: event.target.value }));
                  setSaveState("idle");
                }}
                placeholder="One or two sentences that make the next few seconds impossible to skip."
              />
            </Field>
          </section>

          <section className="panel studio-title">
            <Field label="Script title">
              <Input
                value={document.title}
                onChange={(event) => {
                  setDocument((current) => ({ ...current, title: event.target.value }));
                  setSaveState("idle");
                }}
                placeholder="Working title for this script"
              />
            </Field>
          </section>

          <section className="panel studio-foot-actions">
            <div>
              <strong>{isDirty ? "Unsaved changes" : "Everything is saved"}</strong>
              <p className="subtle">
                {isDirty
                  ? "Saving overwrites the stored script and increments its version."
                  : `Stored as version ${version} on this project.`}
              </p>
            </div>
            <Button type="button" onClick={handleSave} disabled={saveState === "saving" || isGenerating}>
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
        onConfirm={removeScene}
      />
    </div>
  );
}

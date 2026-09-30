export type ProviderKind = "script" | "script-studio" | "image" | "video" | "tts" | "transcription" | "metadata";

export interface ProviderResult<T> { provider: string; mode: "live" | "demo"; data: T; }
export interface ScriptRequest { topic: string; targetDurationSeconds: number; tone: string; }
export interface ScriptOutput { title: string; body: string; }
export interface ScriptProvider { readonly kind: "script"; generate(request: ScriptRequest): Promise<ProviderResult<ScriptOutput>>; }
export interface MediaProvider { readonly kind: "image" | "video"; }
export interface TtsProvider { readonly kind: "tts"; }
export interface TranscriptionProvider { readonly kind: "transcription"; }
export interface MetadataProvider { readonly kind: "metadata"; }

/** Creative brief assembled server-side from the owning project's own rows. */
export interface ScriptBrief {
  projectTitle: string;
  topic: string | null;
  audience: string;
  videoType: string;
  targetDurationSeconds: number;
  visualStyle: string;
  voiceStyle: string;
  aspectRatio: string;
}

/** A scene without its persisted identity, as returned by a provider. */
export interface SceneDraft {
  title: string;
  narration: string;
  visualDirection: string;
  estimatedDurationSeconds: number;
}

export interface ScriptDraft {
  title: string;
  hook: string;
  scenes: SceneDraft[];
}

export interface ScriptStudioProvider {
  readonly kind: "script-studio";
  readonly id: string;
  readonly mode: "live" | "demo";
  generateDocument(brief: ScriptBrief, options: ScriptGenerationOptions): Promise<ProviderResult<ScriptDraft>>;
  regenerateScene(brief: ScriptBrief, options: SceneRegenerationOptions): Promise<ProviderResult<SceneDraft>>;
}

export interface ScriptGenerationOptions {
  sceneCount: number;
  previousDocument?: ScriptDraft | null;
}

export interface SceneRegenerationOptions {
  sceneNumber: number;
  sceneCount: number;
  scene: SceneDraft;
  neighbours: { previous: SceneDraft | null; next: SceneDraft | null };
  direction?: string;
}

export type AIProvider = ScriptProvider | ScriptStudioProvider | MediaProvider | TtsProvider | TranscriptionProvider | MetadataProvider;

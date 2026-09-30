import type {
  ProviderResult,
  SceneDraft,
  SceneRegenerationOptions,
  ScriptBrief,
  ScriptDraft,
  ScriptGenerationOptions,
  ScriptOutput,
  ScriptProvider,
  ScriptRequest,
  ScriptStudioProvider,
} from "./contracts";

/** A clearly marked local fallback. It never calls an external AI service. */
export class DemoScriptProvider implements ScriptProvider {
  readonly kind = "script" as const;
  async generate(request: ScriptRequest): Promise<ProviderResult<ScriptOutput>> {
    return { provider: "demo-script-provider", mode: "demo", data: { title: request.topic, body: `Demo only: a ${request.tone} script outline for roughly ${request.targetDurationSeconds} seconds.` } };
  }
}

const BEATS = [
  { title: "The Hook", narration: "Open on the single idea the viewer cannot unhear, then name the cost of ignoring it." },
  { title: "The Setup", narration: "Establish the everyday situation the audience already recognises, in plain language." },
  { title: "The Tension", narration: "Show what breaks the expected pattern, and give one concrete example of it happening." },
  { title: "The Shift", narration: "Offer the reframing that resolves the tension and makes the rest of the video feel inevitable." },
  { title: "The Proof", narration: "Support the reframe with a detail, a number, or a moment of lived experience." },
  { title: "The Payoff", narration: "Restate the promise from the hook in the audience's own words, now earned." },
  { title: "The Close", narration: "End on a single clear next step the viewer can take today." },
];

/**
 * SERVER ONLY local fallback used when no provider key is configured. It is
 * deterministic, clearly labelled `mode: "demo"`, and must never be presented
 * to the user as AI-generated content.
 */
export class DemoScriptStudioProvider implements ScriptStudioProvider {
  readonly kind = "script-studio" as const;
  readonly id = "demo-script-studio-provider";
  readonly mode = "demo" as const;

  async generateDocument(brief: ScriptBrief, options: ScriptGenerationOptions): Promise<ProviderResult<ScriptDraft>> {
    const sceneCount = Math.min(BEATS.length, Math.max(1, Math.round(options.sceneCount)));
    const perScene = Math.max(5, Math.round(brief.targetDurationSeconds / sceneCount));
    const topic = brief.topic?.trim() || brief.projectTitle;

    const scenes: SceneDraft[] = Array.from({ length: sceneCount }, (_, index) => {
      const beat = BEATS[index % BEATS.length];
      return {
        title: beat.title,
        narration: `${beat.narration} Demo placeholder copy for “${topic}”, written for a ${brief.voiceStyle} delivery in a ${brief.visualStyle} treatment.`,
        visualDirection: `${brief.visualStyle} treatment for “${topic}”: a single clear subject, ${brief.aspectRatio} framing, no on-screen text competing with the narration.`,
        estimatedDurationSeconds: perScene,
      };
    });

    return {
      provider: this.id,
      mode: this.mode,
      data: {
        title: brief.projectTitle,
        hook: `Demo placeholder hook for “${topic}” aimed at ${brief.audience}. Replace this with a real spoken cold-open before production.`,
        scenes,
      },
    };
  }

  async regenerateScene(brief: ScriptBrief, options: SceneRegenerationOptions): Promise<ProviderResult<SceneDraft>> {
    const beat = BEATS[(options.sceneNumber - 1 + BEATS.length) % BEATS.length];
    return {
      provider: this.id,
      mode: this.mode,
      data: {
        title: beat.title,
        narration: `${beat.narration} Demo placeholder rewrite${options.direction ? ` responding to: ${options.direction}` : ""}, written for a ${brief.voiceStyle} delivery.`,
        visualDirection: `${brief.visualStyle} visual direction for “${options.scene.title}” at ${options.scene.estimatedDurationSeconds}s, ${brief.aspectRatio} framing.`,
        estimatedDurationSeconds: options.scene.estimatedDurationSeconds,
      },
    };
  }
}

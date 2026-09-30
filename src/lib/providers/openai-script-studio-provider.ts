import { z } from "zod";
import {
  getScriptProviderConfig,
  resolveChatCompletionsUrl,
  type ScriptProviderConfig,
} from "@/config/script-provider-env";
import { AppError } from "@/lib/errors/app-error";
import type {
  ProviderResult,
  SceneDraft,
  SceneRegenerationOptions,
  ScriptBrief,
  ScriptDraft,
  ScriptGenerationOptions,
  ScriptStudioProvider,
} from "./contracts";

/**
 * SERVER ONLY. Reads its credentials from `src/config/script-provider-env` and
 * calls an OpenAI-compatible chat completions endpoint over `fetch`. This file
 * must never be imported from a client component.
 *
 * The API key is only ever placed in an outgoing `Authorization` header. It is
 * scrubbed out of every error message, log line, and error `cause` before the
 * failure leaves this module.
 */

const MAX_SCENES = 12;
const MAX_ERROR_DETAIL = 300;
const OPTIONAL_PARAMS = ["response_format", "temperature"] as const;

const sceneSchema = z.object({
  title: z.string().trim().min(1).max(160),
  narration: z.string().trim().min(1).max(4_000),
  visualDirection: z.string().trim().min(1).max(1_000),
  estimatedDurationSeconds: z.number().int().min(1).max(600),
});

const draftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  hook: z.string().trim().max(2_000),
  scenes: z.array(sceneSchema).min(1).max(MAX_SCENES),
});

interface CompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  error?: { message?: string } | null;
}

type ChatMessage = { role: "system" | "user"; content: string };

/**
 * Removes the API key and anything that looks like a bearer token from text
 * that will be surfaced in an error. Provider error bodies occasionally echo
 * request headers back, so this runs on every outgoing detail string.
 */
function createRedactor(apiKey: string) {
  return (value: string) => {
    let text = value;
    if (apiKey) text = text.split(apiKey).join("[redacted]");
    return text
      .replace(/(bearer\s+)[A-Za-z0-9._\-~+/]{8,}=*/gi, "$1[redacted]")
      .replace(/("?(?:api[_-]?key|authorization|x-api-key)"?\s*[:=]\s*"?)[^"\s,}]{4,}/gi, "$1[redacted]")
      .replace(/\bsk-[A-Za-z0-9._\-]{8,}\b/g, "[redacted]")
      .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9._\-]{8,}\b/g, "[redacted]")
      .slice(0, MAX_ERROR_DETAIL);
  };
}

function buildBriefBlock(brief: ScriptBrief) {
  return [
    `Working title: ${brief.projectTitle}`,
    `Topic: ${brief.topic?.trim() || brief.projectTitle}`,
    `Audience: ${brief.audience}`,
    `Video format: ${brief.videoType}`,
    `Target runtime: ${brief.targetDurationSeconds} seconds`,
    `Visual style: ${brief.visualStyle}`,
    `Narration voice: ${brief.voiceStyle}`,
    `Aspect ratio: ${brief.aspectRatio}`,
  ].join("\n");
}

function describeNeighbours(previous: SceneDraft | null, next: SceneDraft | null) {
  if (!previous && !next) return "This is the only scene in the script.";
  return [
    previous
      ? `Previous scene — title: ${previous.title}; narration: ${previous.narration}`
      : "Previous scene: none (this is the opening scene).",
    next
      ? `Next scene — title: ${next.title}; narration: ${next.narration}`
      : "Next scene: none (this is the closing scene).",
  ].join("\n");
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const attempts = [candidate];
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end > start) attempts.push(candidate.slice(start, end + 1));

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch {
      /* try the next strategy */
    }
  }
  throw new AppError(
    "The script provider returned text that is not valid JSON.",
    "SCRIPT_PROVIDER_MALFORMED_JSON",
    502,
  );
}

function describeHttpFailure(status: number, detail: string, model: string, endpoint: string) {
  if (status === 401 || status === 403) {
    return new AppError(
      "The script provider rejected the API key. Check SCRIPT_PROVIDER_API_KEY and that the key may use this endpoint.",
      "SCRIPT_PROVIDER_UNAUTHORIZED",
      502,
      { status, detail },
    );
  }
  if (status === 404) {
    return new AppError(
      `The script provider has no endpoint at ${endpoint}. Check SCRIPT_PROVIDER_BASE_URL.`,
      "SCRIPT_PROVIDER_NOT_FOUND",
      502,
      { status, detail },
    );
  }
  if (status === 429) {
    return new AppError(
      "The script provider is rate limiting this key. Wait a moment and try again.",
      "SCRIPT_PROVIDER_RATE_LIMITED",
      429,
      { status, detail },
    );
  }
  if (status === 400 || status === 422) {
    return new AppError(
      `The script provider rejected the request. The model "${model}" may not support the parameters this studio sends.`,
      "SCRIPT_PROVIDER_BAD_REQUEST",
      502,
      { status, detail },
    );
  }
  if (status >= 500) {
    return new AppError(
      `The script provider is unavailable (HTTP ${status}). Try again in a moment.`,
      "SCRIPT_PROVIDER_UPSTREAM_ERROR",
      502,
      { status, detail },
    );
  }
  return new AppError(
    `The script provider rejected the request (HTTP ${status}).`,
    "SCRIPT_PROVIDER_HTTP_ERROR",
    502,
    { status, detail },
  );
}

export interface OpenAiScriptStudioProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export class OpenAiScriptStudioProvider implements ScriptStudioProvider {
  readonly kind = "script-studio" as const;
  readonly id = "openai-compatible-script-studio";
  readonly mode = "live" as const;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly endpoint: string;
  private readonly redact: (value: string) => string;

  constructor(options: OpenAiScriptStudioProviderOptions = {}) {
    const config: ScriptProviderConfig = getScriptProviderConfig();
    this.apiKey = options.apiKey ?? config.apiKey;
    this.baseUrl = (options.baseUrl ?? config.baseUrl).replace(/\/+$/, "");
    this.model = options.model ?? config.model;
    this.timeoutMs = options.timeoutMs ?? config.timeoutMs;
    this.endpoint = resolveChatCompletionsUrl(this.baseUrl);
    this.redact = createRedactor(this.apiKey);
  }

  async generateDocument(brief: ScriptBrief, options: ScriptGenerationOptions): Promise<ProviderResult<ScriptDraft>> {
    this.assertReady();
    const sceneCount = Math.min(MAX_SCENES, Math.max(1, Math.round(options.sceneCount)));
    const previous = options.previousDocument
      ? `\n\nThe creator is revising this existing script. Improve it rather than restarting it. Return it in full with the same scene count where sensible:\n${JSON.stringify(options.previousDocument)}`
      : "";

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "You are the head writer for a short-form video production studio.",
          "You always answer with a single JSON object and nothing else.",
          "Narration is written to be spoken aloud: no markdown, no bullet points, no stage directions, no emoji.",
          "Visual direction describes what the viewer sees on screen, not what is said.",
          `Between 1 and ${MAX_SCENES} scenes. Split the runtime evenly across the scenes.`,
          'Output shape: {"title":string,"hook":string,"scenes":[{"title":string,"narration":string,"visualDirection":string,"estimatedDurationSeconds":number}]}',
        ].join(" "),
      },
      {
        role: "user",
        content: [
          buildBriefBlock(brief),
          `Write exactly ${sceneCount} scene${sceneCount === 1 ? "" : "s"}.`,
          "The hook is the spoken cold-open that must earn the next few seconds of attention, and it is separate from scene 1.",
          "Narration across all scenes should land close to the target runtime at roughly 150 spoken words per minute.",
          previous,
        ].join("\n\n"),
      },
    ];

    const raw = await this.complete(messages);
    const parsed = draftSchema.safeParse(extractJson(raw));
    if (!parsed.success) {
      throw new AppError(
        "The script provider returned JSON that does not match the studio's scene format.",
        "SCRIPT_PROVIDER_INVALID_RESPONSE",
        502,
        { issues: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`) },
      );
    }
    return { provider: this.id, mode: this.mode, data: parsed.data };
  }

  async regenerateScene(brief: ScriptBrief, options: SceneRegenerationOptions): Promise<ProviderResult<SceneDraft>> {
    this.assertReady();

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: [
          "You rewrite a single scene of an existing video script.",
          "You always answer with a single JSON object and nothing else.",
          'Output shape: {"title":string,"narration":string,"visualDirection":string,"estimatedDurationSeconds":number}',
        ].join(" "),
      },
      {
        role: "user",
        content: [
          buildBriefBlock(brief),
          `This is scene ${options.sceneNumber} of ${options.sceneCount}.`,
          options.direction
            ? `The creator asked for this change: ${options.direction}`
            : "Rewrite the scene so it is sharper and better paced. Keep the same narrative job in the script.",
          `Current scene — title: ${options.scene.title}; narration: ${options.scene.narration}; visual direction: ${options.scene.visualDirection}; estimated duration: ${options.scene.estimatedDurationSeconds}s.`,
          describeNeighbours(options.neighbours.previous, options.neighbours.next),
        ].join("\n\n"),
      },
    ];

    const raw = await this.complete(messages);
    const parsed = sceneSchema.safeParse(extractJson(raw));
    if (!parsed.success) {
      throw new AppError(
        "The script provider returned JSON that does not match the studio's scene format.",
        "SCRIPT_PROVIDER_INVALID_RESPONSE",
        502,
        { issues: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`) },
      );
    }
    return { provider: this.id, mode: this.mode, data: parsed.data };
  }

  private assertReady(): void {
    const isKiloFreeGateway = this.baseUrl.includes("api.kilo.ai") && this.apiKey === "";
    if (this.apiKey || isKiloFreeGateway) return;
    throw new AppError(
      "SCRIPT_PROVIDER_API_KEY is not set on the server, so the live script provider cannot be called. " +
        "Add it to .env.local and restart the server.",
      "SCRIPT_PROVIDER_MISSING_KEY",
      503,
    );
  }

  private buildBody(messages: ChatMessage[], drop: readonly string[]) {
    const body: Record<string, unknown> = { model: this.model, messages };
    if (!drop.includes("temperature")) body.temperature = 0.7;
    if (!drop.includes("response_format")) body.response_format = { type: "json_object" };
    return JSON.stringify(body);
  }

  private async complete(messages: ChatMessage[]): Promise<string> {
    this.assertReady();

    // Some OpenAI-compatible endpoints do not accept every optional parameter.
    // Start strict, then retry once without whichever parameter the endpoint
    // named in its own 400 response.
    let drop: string[] = [];
    let body = this.buildBody(messages, drop);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (this.apiKey) {
        headers.Authorization = `Bearer ${this.apiKey}`;
      }
      try {
        response = await fetch(this.endpoint, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
        });
      } catch (error) {
        if (isTimeout(error)) {
          throw new AppError(
            `The script provider did not respond within ${Math.round(this.timeoutMs / 1000)} seconds.`,
            "SCRIPT_PROVIDER_TIMEOUT",
            504,
          );
        }
        throw new AppError(
          "The script provider could not be reached. Check SCRIPT_PROVIDER_BASE_URL and network access from the server.",
          "SCRIPT_PROVIDER_UNREACHABLE",
          502,
          { reason: this.redact(error instanceof Error ? error.message : "unknown transport error") },
        );
      }

      const text = await response.text().catch(() => "");

      if (!response.ok) {
        const detail = this.redact(text);
        const removable = OPTIONAL_PARAMS.filter((param) => detail.toLowerCase().includes(param));
        if (attempt === 0 && response.status === 400 && removable.length > 0) {
          drop = removable;
          body = this.buildBody(messages, drop);
          continue;
        }
        throw describeHttpFailure(response.status, detail, this.model, this.endpoint);
      }

      if (!text.trim()) {
        throw new AppError("The script provider returned an empty response body.", "SCRIPT_PROVIDER_EMPTY_RESPONSE", 502);
      }

      let payload: CompletionResponse;
      try {
        payload = JSON.parse(text) as CompletionResponse;
      } catch {
        throw new AppError(
          "The script provider returned a response that is not valid JSON.",
          "SCRIPT_PROVIDER_MALFORMED_RESPONSE",
          502,
        );
      }

      if (payload.error?.message) {
        throw new AppError(
          `The script provider reported an error: ${this.redact(payload.error.message)}`,
          "SCRIPT_PROVIDER_UPSTREAM_ERROR",
          502,
        );
      }

      const choice = payload.choices?.[0];
      const content = choice?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        if (choice?.finish_reason === "content_filter") {
          throw new AppError(
            "The script provider's safety filter stopped this generation. Reword the topic and try again.",
            "SCRIPT_PROVIDER_CONTENT_FILTERED",
            502,
          );
        }
        if (choice?.finish_reason === "length") {
          throw new AppError(
            "The script provider stopped before finishing the script. Try fewer scenes.",
            "SCRIPT_PROVIDER_TRUNCATED",
            502,
          );
        }
        throw new AppError(
          "The script provider returned no message content.",
          "SCRIPT_PROVIDER_EMPTY_RESPONSE",
          502,
        );
      }
      return content;
    }

    throw new AppError(
      "The script provider could not be reached.",
      "SCRIPT_PROVIDER_UNREACHABLE",
      502,
    );
  }
}

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

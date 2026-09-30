import { z } from "zod";

/**
 * SERVER ONLY script provider configuration.
 *
 * Every variable here is deliberately un-prefixed so Next.js never inlines it
 * into browser JavaScript. This module must not be imported from a client
 * component; the values are read from `process.env` at call time so a restarted
 * or revalidated server always sees the current value.
 *
 * Nothing in this module returns, logs, or serialises an API key.
 */

export type ScriptProviderMode = "live" | "demo";

export const SCRIPT_PROVIDER_DEFAULTS = {
  baseUrl: "https://api.kilo.ai/api/gateway",
  model: "kilo-auto/free",
  timeoutMs: 60_000,
} as const;

/** Variable names only. Used to tell an operator what is missing. */
export const SCRIPT_PROVIDER_VARIABLES = {
  mode: "SCRIPT_PROVIDER_MODE",
  apiKey: "SCRIPT_PROVIDER_API_KEY",
  baseUrl: "SCRIPT_PROVIDER_BASE_URL",
  model: "SCRIPT_PROVIDER_MODEL",
  timeoutMs: "SCRIPT_PROVIDER_TIMEOUT_MS",
} as const;

const rawSchema = z.object({
  mode: z.enum(["live", "demo"]).optional(),
  apiKey: z.string().trim().optional(),
  baseUrl: z.string().trim().url().optional(),
  model: z.string().trim().min(1).optional(),
  timeoutMs: z.coerce.number().int().min(5_000).max(300_000).optional(),
});

export interface ScriptProviderConfig {
  mode: ScriptProviderMode;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface ScriptProviderConfigStatus {
  mode: ScriptProviderMode;
  configured: boolean;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Names of unset variables, never values. */
  missing: string[];
  /** Operator-facing explanation, or an empty string when healthy. */
  message: string;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/** `https://host/v1` and `https://host/v1/chat/completions` both resolve correctly. */
export function resolveChatCompletionsUrl(baseUrl: string) {
  const normalized = trimTrailingSlash(baseUrl);
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function readRaw() {
  const result = rawSchema.safeParse({
    mode: process.env[SCRIPT_PROVIDER_VARIABLES.mode]?.trim().toLowerCase(),
    apiKey: process.env[SCRIPT_PROVIDER_VARIABLES.apiKey]?.trim(),
    baseUrl: process.env[SCRIPT_PROVIDER_VARIABLES.baseUrl]?.trim(),
    model: process.env[SCRIPT_PROVIDER_VARIABLES.model]?.trim(),
    timeoutMs: process.env[SCRIPT_PROVIDER_VARIABLES.timeoutMs],
  });
  if (!result.success) {
    const invalid = result.error.issues.map((issue) => issue.path.join(".") || "value").join(", ");
    throw new Error(`Invalid ${Object.values(SCRIPT_PROVIDER_VARIABLES).join(" / ")} configuration: ${invalid}.`);
  }
  return result.data;
}

export function getScriptProviderConfig(): ScriptProviderConfig {
  const raw = readRaw();
  return {
    // Live is the only default. The demo provider requires an explicit opt-in.
    mode: raw.mode ?? "live",
    apiKey: raw.apiKey ?? "",
    baseUrl: trimTrailingSlash(raw.baseUrl ?? SCRIPT_PROVIDER_DEFAULTS.baseUrl),
    model: raw.model ?? SCRIPT_PROVIDER_DEFAULTS.model,
    timeoutMs: raw.timeoutMs ?? SCRIPT_PROVIDER_DEFAULTS.timeoutMs,
  };
}

/** A secret-free description safe to pass to a server component or the browser. */
export function getScriptProviderConfigStatus(): ScriptProviderConfigStatus {
  const config = getScriptProviderConfig();

  if (config.mode === "demo") {
    return {
      mode: "demo",
      configured: true,
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: config.timeoutMs,
      missing: [],
      message: "",
    };
  }

  const missing: string[] = [];
  // Allow empty API key for anonymous free endpoints (e.g., Kilo gateway free models)
  const isKiloFreeGateway = config.baseUrl.includes("api.kilo.ai") && config.apiKey === "";
  if (!config.apiKey && !isKiloFreeGateway) missing.push(SCRIPT_PROVIDER_VARIABLES.apiKey);

  if (missing.length > 0) {
    return {
      mode: "live",
      configured: false,
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: config.timeoutMs,
      missing,
      message:
        `The live script provider is selected but ${missing.join(" and ")} is not set. ` +
        `Add it to .env.local and restart the server, or set ${SCRIPT_PROVIDER_VARIABLES.mode}=demo ` +
        "to use the labelled local demo provider instead.",
    };
  }

  return {
    mode: "live",
    configured: true,
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    missing: [],
    message: "",
  };
}

/** A stable, secret-free fingerprint used to invalidate the cached provider. */
export function getScriptProviderConfigFingerprint() {
  const status = getScriptProviderConfigStatus();
  return [status.mode, status.configured, status.baseUrl, status.model, status.timeoutMs].join("|");
}

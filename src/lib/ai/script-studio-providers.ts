import {
  getScriptProviderConfigFingerprint,
  getScriptProviderConfigStatus,
} from "@/config/script-provider-env";
import { createProviderRegistry } from "@/lib/ai/provider-registry";
import { DemoScriptStudioProvider } from "@/lib/providers/demo-script-provider";
import { OpenAiScriptStudioProvider } from "@/lib/providers/openai-script-studio-provider";
import type { AIProvider, ScriptStudioProvider } from "@/lib/providers/contracts";

/**
 * SERVER ONLY. Resolves the Script Studio provider through the same registry
 * the rest of the application uses.
 *
 * The live OpenAI-compatible provider is the default. The demo provider is only
 * ever selected when `SCRIPT_PROVIDER_MODE=demo` is set explicitly, so a
 * missing API key surfaces as a configuration error instead of silently
 * downgrading generated scripts to placeholder copy.
 */

export interface ScriptStudioProviderDescription {
  provider: string;
  mode: "live" | "demo";
  configured: boolean;
  /** Names of unset variables, never values. */
  missing: string[];
  message: string;
}

let cache: { fingerprint: string; provider: ScriptStudioProvider } | null = null;

function selectProvider(candidates: AIProvider[]): ScriptStudioProvider {
  const resolved = createProviderRegistry(candidates).get("script-studio");
  return resolved?.kind === "script-studio" ? resolved : new DemoScriptStudioProvider();
}

export function resolveScriptStudioProvider(): ScriptStudioProvider {
  const fingerprint = getScriptProviderConfigFingerprint();
  if (cache?.fingerprint === fingerprint) return cache.provider;

  const status = getScriptProviderConfigStatus();
  const provider =
    status.mode === "demo"
      ? selectProvider([new DemoScriptStudioProvider()])
      : selectProvider([new OpenAiScriptStudioProvider(), new DemoScriptStudioProvider()]);

  cache = { fingerprint, provider };
  return provider;
}

/** Safe to call during render: never throws and never reveals a credential. */
export function describeScriptStudioProvider(): ScriptStudioProviderDescription {
  const status = getScriptProviderConfigStatus();
  return {
    provider: status.mode === "demo" ? "demo-script-studio-provider" : "openai-compatible-script-studio",
    mode: status.mode,
    configured: status.configured,
    missing: status.missing,
    message: status.message,
  };
}

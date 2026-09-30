#!/usr/bin/env node
/**
 * Safe Script Studio provider check.
 *
 *   node scripts/check-script-provider.mjs
 *
 * Reads the server-only SCRIPT_PROVIDER_* variables (from the process
 * environment, falling back to .env.local), prints only non-secret
 * configuration, and — when the live provider is configured — performs one
 * real `generateDocument` round trip and one `regenerateScene` round trip
 * through the actual `OpenAiScriptStudioProvider` code path.
 *
 * This script NEVER prints the API key. Every string it prints is passed
 * through a redactor first, and a final assertion fails the run if the key
 * appears in any output.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

/**
 * `src/lib/errors/app-error.ts` uses TypeScript parameter properties, which
 * Node's strip-only mode cannot handle. Re-run this file once with the type
 * transform enabled so the plain `node scripts/check-script-provider.mjs`
 * command works on its own.
 */
if (!process.execArgv.some((arg) => arg.includes("transform-types"))) {
  const result = spawnSync(
    process.execPath,
    ["--experimental-transform-types", "--no-warnings", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "..");

/* ------------------------------------------------------------------ */
/* Load .env.local into process.env without printing anything.         */
/* ------------------------------------------------------------------ */

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined && name) process.env[name] = value;
  }
}

loadEnvFile(path.join(PROJECT_ROOT, ".env.local"));
loadEnvFile(path.join(PROJECT_ROOT, ".env"));

/* ------------------------------------------------------------------ */
/* Resolve the "@/..." TypeScript alias so the real modules load.      */
/* ------------------------------------------------------------------ */

const SRC_ROOT = path.join(PROJECT_ROOT, "src");
register(
  pathToFileURL(
    path.join(
      HERE,
      "alias-hooks.mjs",
    ),
  ).href,
  { parentURL: pathToFileURL(path.join(HERE, "check-script-provider.mjs")).href, data: { srcRoot: SRC_ROOT } },
);

const { getScriptProviderConfigStatus, SCRIPT_PROVIDER_VARIABLES } = await import(
  pathToFileURL(path.join(SRC_ROOT, "config", "script-provider-env.ts")).href
);
const { OpenAiScriptStudioProvider } = await import(
  pathToFileURL(path.join(SRC_ROOT, "lib", "providers", "openai-script-studio-provider.ts")).href
);

/* ------------------------------------------------------------------ */
/* Output guard                                                        */
/* ------------------------------------------------------------------ */

const API_KEY = process.env[SCRIPT_PROVIDER_VARIABLES.apiKey] ?? "";
const SECRET_PATTERN = /\b(?:sk|sb_publishable|sb_secret)-[A-Za-z0-9._-]{8,}\b/;

function safe(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (API_KEY ? text.split(API_KEY).join("[redacted]") : text)
    .replace(SECRET_PATTERN, "[redacted]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]{8,}=*/gi, "$1[redacted]");
}

const printed = [];
function say(line = "") {
  printed.push(line);
  console.log(safe(line));
}

function heading(text) {
  say();
  say(text);
  say("-".repeat(text.length));
}

function words(value) {
  const matches = String(value).trim().match(/[\p{L}\p{N}'’-]+/gu);
  return matches ? matches.length : 0;
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

say("VideoForge — Script Studio provider check");
say("This check never prints the API key.");

heading("1. Configuration");
const status = getScriptProviderConfigStatus();
say(`mode            : ${status.mode}`);
say(`configured      : ${status.configured ? "yes" : "no"}`);
say(`base url        : ${status.baseUrl}`);
say(`model           : ${status.model}`);
say(`timeout         : ${status.timeoutMs} ms`);
say(`api key         : ${process.env[SCRIPT_PROVIDER_VARIABLES.apiKey] ? "present (value not shown)" : "absent"}`);
if (status.missing.length) say(`missing         : ${status.missing.join(", ")}`);

if (status.mode === "demo") {
  heading("2. Result");
  say("SCRIPT_PROVIDER_MODE=demo, so the local placeholder provider is selected.");
  say("No network call was made. Set SCRIPT_PROVIDER_MODE=live to test a real endpoint.");
} else if (!status.configured) {
  heading("2. Result");
  say(status.message);
  process.exitCode = 1;
} else {
  const provider = new OpenAiScriptStudioProvider();
  const brief = {
    projectTitle: "Provider Check",
    topic: "a short demonstration of a concrete everyday mechanism",
    audience: "General Public",
    videoType: "Explainer / Video Essay",
    targetDurationSeconds: 30,
    visualStyle: "Editorial",
    voiceStyle: "Clear Explainer",
    aspectRatio: "16:9",
  };

  heading("2. Live generateDocument round trip");
  const generated = await provider.generateDocument(brief, { sceneCount: 3 });
  say(`provider        : ${generated.provider}`);
  say(`mode            : ${generated.mode}`);
  say(`title           : ${generated.data.title}`);
  say(`hook words      : ${words(generated.data.hook)}`);
  say(`scenes returned : ${generated.data.scenes.length}`);
  for (const [index, scene] of generated.data.scenes.entries()) {
    say(
      `  scene ${index + 1}: "${scene.title}" — ${words(scene.narration)} words, ` +
        `${scene.estimatedDurationSeconds}s, visual ${words(scene.visualDirection)} words`,
    );
  }
  const total = generated.data.scenes.reduce((sum, scene) => sum + scene.estimatedDurationSeconds, 0);
  say(`total duration  : ${total}s`);

  heading("3. Live regenerateScene round trip");
  const rewritten = await provider.regenerateScene(brief, {
    sceneNumber: 2,
    sceneCount: generated.data.scenes.length,
    scene: generated.data.scenes[1],
    neighbours: { previous: generated.data.scenes[0], next: generated.data.scenes[2] ?? null },
    direction: "Tighten the opening line.",
  });
  say(`provider        : ${rewritten.provider}`);
  say(`mode            : ${rewritten.mode}`);
  say(`title           : ${rewritten.data.title}`);
  say(`narration words : ${words(rewritten.data.narration)}`);
  say(`duration        : ${rewritten.data.estimatedDurationSeconds}s`);

  heading("4. Error handling");
  say("Unreachable endpoint:");
  const broken = new OpenAiScriptStudioProvider({ baseUrl: "http://127.0.0.1:9/v1", timeoutMs: 4000 });
  try {
    await broken.generateDocument(brief, { sceneCount: 1 });
    say("  no error raised (unexpected)");
  } catch (error) {
    say(`  code    : ${error.code}`);
    say(`  message : ${error.message}`);
  }

  say("Anonymous Kilo free gateway (no API key):");
  const keyless = new OpenAiScriptStudioProvider({ apiKey: "", baseUrl: "https://api.kilo.ai/api/gateway", model: "kilo-auto/free" });
  try {
    await keyless.generateDocument(brief, { sceneCount: 1 });
    say("  OK: anonymous access works");
  } catch (error) {
    say(`  code    : ${error.code}`);
    say(`  message : ${error.message}`);
  }

  say("Short timeout:");
  const slow = new OpenAiScriptStudioProvider({ timeoutMs: 1 });
  try {
    await slow.generateDocument(brief, { sceneCount: 1 });
    say("  no error raised (unexpected)");
  } catch (error) {
    say(`  code    : ${error.code}`);
    say(`  message : ${error.message}`);
  }

  heading("5. Secret hygiene");
  if (API_KEY && printed.some((line) => line.includes(API_KEY))) {
    say("FAILED: the API key appeared in this script's output.");
    process.exitCode = 1;
  } else {
    say("OK: the API key does not appear anywhere in this output.");
  }
}

if (API_KEY && printed.some((line) => line.includes(API_KEY))) {
  console.error("\nABORT: the API key leaked into output.");
  process.exit(1);
}

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

/** Maps the project's "@/..." TypeScript alias onto src/ for plain Node runs. */
let srcRoot;

export async function initialize(data) {
  srcRoot = data.srcRoot;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/") && srcRoot) {
    const base = path.join(srcRoot, specifier.slice(2));
    for (const candidate of [base + ".ts", base + ".tsx", path.join(base, "index.ts"), base]) {
      if (existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
    }
    throw new Error(`Alias not found: ${specifier}`);
  }
  // Allow next/* subpath imports without .js extension when running in plain Node ESM
  if (specifier.startsWith("next/") && !specifier.endsWith(".js")) {
    return next(specifier + ".js", context);
  }
  return next(specifier, context);
}

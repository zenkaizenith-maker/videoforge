import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, "../..");
const SRC_ROOT = path.join(PROJECT_ROOT, "src");

// Register alias resolver for @/... paths
register(
  pathToFileURL(path.join(PROJECT_ROOT, "scripts", "alias-hooks.mjs")).href,
  {
    parentURL: import.meta.url,
    data: { srcRoot: SRC_ROOT },
  }
);

// Now import the actual server implementation
await import("./server.ts");

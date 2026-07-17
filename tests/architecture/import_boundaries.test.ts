import { assertEquals } from "@std/assert";
import { dirname, relative, resolve } from "@std/path";

const SOURCE_ROOT = resolve(Deno.cwd(), "src");
const ALLOWED_LAYER_DEPENDENCIES = {
  app: new Set(["app", "game"]),
  game: new Set(["game"]),
} as const;
const PUBLIC_ENGINE_IMPORTS = new Set([
  "turn-based-engine/crawler",
  "turn-based-engine/ecs",
  "turn-based-engine/rng",
  "turn-based-engine/simulation",
  "turn-based-web-engine/audio",
  "turn-based-web-engine/canvas",
  "turn-based-web-engine/input",
  "turn-based-web-engine/raycast",
]);
const DISPLACED_LOCAL_PREFIXES = [
  ["@", "src", "engine"].join("/"),
  ["@", "src", "platform"].join("/"),
] as const;
const GLOBALLY_DISPLACED = [
  /\bcreateCrawlerGame\b/,
  /\brestoreCrawlerGame\b/,
  /\brestoreCrawlerSession\b/,
  /\bCrawlerGame\b/,
  /\bCrawlerSession\b/,
  /\bdispatchCrawlerActor(?:Turn|Round)\b/,
  /\bdispatchVoid\b/,
  /\bentityPositionSnapshot\b/,
  /\bQuerySnapshot\b/,
  /\bruntime\.(?:game|crawler)\b/,
  /\bsession\.transaction\s*\(/,
] as const;
const DIRECT_SIMULATION_WRITES = [
  /\.storage\.[A-Za-z0-9_]+\.(?:set|setAt|patch)\s*\(/,
  /\.storage\s*\[[^\]]+\]\s*\.(?:set|setAt|patch)\s*\(/,
] as const;

type SourceLayer = keyof typeof ALLOWED_LAYER_DEPENDENCIES;

Deno.test({
  name: "source layers only import permitted dependencies",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const violations: string[] = [];
    for (const sourcePath of await sourceFiles(SOURCE_ROOT)) {
      const importer = sourceLayer(sourcePath);
      if (importer === undefined) continue;

      for (const specifier of importSpecifiers(await Deno.readTextFile(sourcePath))) {
        const imported = importedLayer(sourcePath, specifier);
        if (imported !== undefined && !ALLOWED_LAYER_DEPENDENCIES[importer].has(imported)) {
          violations.push(`${relative(SOURCE_ROOT, sourcePath)}: ${importer} -> ${imported} via ${specifier}`);
        }
      }
    }
    assertEquals(violations, []);
  },
});

Deno.test({
  name: "public engine imports and completed ownership cutovers remain enforced",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const violations: string[] = [];
    for (const sourcePath of await sourceFiles(SOURCE_ROOT)) {
      const source = await Deno.readTextFile(sourcePath);
      const name = relative(SOURCE_ROOT, sourcePath);
      for (const specifier of importSpecifiers(source)) {
        if (
          (specifier.includes("turn-based-engine") || specifier.includes("turn-based-web-engine")) &&
          !PUBLIC_ENGINE_IMPORTS.has(specifier)
        ) {
          violations.push(`${name}: non-public engine import ${specifier}`);
        }
        for (const prefix of DISPLACED_LOCAL_PREFIXES) {
          if (specifier.startsWith(prefix)) violations.push(`${name}: displaced local engine import ${specifier}`);
        }
      }
      for (const pattern of GLOBALLY_DISPLACED) {
        if (pattern.test(source)) violations.push(`${name}: displaced execution path ${pattern.source}`);
      }
      if (!sourcePath.startsWith(resolve(SOURCE_ROOT, "game/simulation"))) continue;
      for (const pattern of DIRECT_SIMULATION_WRITES) {
        if (pattern.test(source)) violations.push(`${name}: direct simulation storage write ${pattern.source}`);
      }
    }
    assertEquals(violations, []);
  },
});

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory) files.push(...await sourceFiles(path));
    else if (entry.isFile && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) files.push(path);
  }
  return files.sort();
}

function sourceLayer(path: string): SourceLayer | undefined {
  const [layer] = relative(SOURCE_ROOT, path).split("/");
  return layer in ALLOWED_LAYER_DEPENDENCIES ? layer as SourceLayer : undefined;
}

function importedLayer(sourcePath: string, specifier: string): SourceLayer | undefined {
  if (specifier.startsWith("@/src/")) {
    const [layer] = specifier.slice("@/src/".length).split("/");
    return layer in ALLOWED_LAYER_DEPENDENCIES ? layer as SourceLayer : undefined;
  }
  if (!specifier.startsWith(".")) return undefined;
  return sourceLayer(resolve(dirname(sourcePath), specifier));
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]!);
  }
  return specifiers;
}

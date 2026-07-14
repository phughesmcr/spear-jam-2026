import { assertEquals } from "@std/assert";
import { dirname, relative, resolve } from "@std/path";

const SOURCE_ROOT = resolve(Deno.cwd(), "src");
const TRANSITION_ROOT = resolve(SOURCE_ROOT, "game/model/transition");
const TRANSITION_PUBLIC_MODULE = resolve(TRANSITION_ROOT, "mod.ts");
const LEGACY_TRANSITION_MODULES = new Set([
  resolve(SOURCE_ROOT, "game/model/transition.ts"),
  resolve(SOURCE_ROOT, "game/model/mode_handlers.ts"),
  resolve(SOURCE_ROOT, "game/model/verb_menu_transition.ts"),
]);
const ALLOWED_DEPENDENCIES = {
  app: new Set(["app", "engine", "game", "platform"]),
  engine: new Set(["engine"]),
  game: new Set(["engine", "game"]),
  platform: new Set(["engine", "platform"]),
} as const;

type SourceLayer = keyof typeof ALLOWED_DEPENDENCIES;

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for await (const entry of Deno.readDir(directory)) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory) files.push(...await sourceFiles(path));
    else if (entry.isFile && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) files.push(path);
  }
  return files;
}

function sourceLayer(path: string): SourceLayer | undefined {
  const [layer] = relative(SOURCE_ROOT, path).split("/");
  return layer in ALLOWED_DEPENDENCIES ? layer as SourceLayer : undefined;
}

function importedLayer(sourcePath: string, specifier: string): SourceLayer | undefined {
  if (specifier.startsWith("@/src/")) {
    const [layer] = specifier.slice("@/src/".length).split("/");
    return layer in ALLOWED_DEPENDENCIES ? layer as SourceLayer : undefined;
  }
  if (!specifier.startsWith(".")) return undefined;
  return sourceLayer(resolve(dirname(sourcePath), specifier));
}

function importedSourcePath(sourcePath: string, specifier: string): string | undefined {
  if (specifier.startsWith("@/src/")) return resolve(SOURCE_ROOT, specifier.slice("@/src/".length));
  if (specifier.startsWith(".")) return resolve(dirname(sourcePath), specifier);
  return undefined;
}

function dependencyCycle(dependencies: ReadonlyMap<string, readonly string[]>): readonly string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(path: string, stack: readonly string[]): readonly string[] | undefined {
    const cycleStart = stack.indexOf(path);
    if (cycleStart >= 0) return [...stack.slice(cycleStart), path];
    if (visited.has(path)) return undefined;

    visiting.add(path);
    const nextStack = [...stack, path];
    for (const dependency of dependencies.get(path) ?? []) {
      const cycle = visit(dependency, nextStack);
      if (cycle !== undefined) return cycle;
    }
    visiting.delete(path);
    visited.add(path);
    return undefined;
  }

  for (const path of dependencies.keys()) {
    if (visiting.has(path) || visited.has(path)) continue;
    const cycle = visit(path, []);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
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

Deno.test({
  name: "source layers only import permitted dependencies",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const violations: string[] = [];
    for (const sourcePath of await sourceFiles(SOURCE_ROOT)) {
      const importer = sourceLayer(sourcePath);
      if (importer === undefined) continue;

      const source = await Deno.readTextFile(sourcePath);
      for (const specifier of importSpecifiers(source)) {
        const dependency = importedLayer(sourcePath, specifier);
        if (dependency === undefined || ALLOWED_DEPENDENCIES[importer].has(dependency)) continue;
        violations.push(`${relative(SOURCE_ROOT, sourcePath)} imports ${specifier}`);
      }
    }

    assertEquals(violations.sort(), []);
  },
});

Deno.test({
  name: "game transition modules expose one sealed public boundary",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const violations: string[] = [];
    const files = await sourceFiles(SOURCE_ROOT);
    const transitionFiles = new Set(files.filter((path) => path.startsWith(`${TRANSITION_ROOT}/`)));
    const transitionDependencies = new Map([...transitionFiles].map((path) => [path, [] as string[]]));
    for (const legacyPath of LEGACY_TRANSITION_MODULES) {
      if (files.includes(legacyPath)) violations.push(`${relative(SOURCE_ROOT, legacyPath)} still exists`);
    }

    for (const sourcePath of files) {
      const importer = relative(SOURCE_ROOT, sourcePath);
      const isTransitionModule = sourcePath.startsWith(`${TRANSITION_ROOT}/`);

      for (const specifier of importSpecifiers(await Deno.readTextFile(sourcePath))) {
        const importedPath = importedSourcePath(sourcePath, specifier);
        if (importedPath === undefined) continue;
        if (isTransitionModule && transitionFiles.has(importedPath)) {
          transitionDependencies.get(sourcePath)!.push(importedPath);
        }
        if (LEGACY_TRANSITION_MODULES.has(importedPath)) {
          violations.push(`${importer} imports legacy ${specifier}`);
          continue;
        }
        if (isTransitionModule && importedPath === TRANSITION_PUBLIC_MODULE) {
          violations.push(`${importer} imports the transition public module`);
          continue;
        }
        if (
          !isTransitionModule && importedPath.startsWith(`${TRANSITION_ROOT}/`) &&
          importedPath !== TRANSITION_PUBLIC_MODULE
        ) {
          violations.push(`${importer} bypasses game/model/transition/mod.ts via ${specifier}`);
        }
      }
    }

    const cycle = dependencyCycle(transitionDependencies);
    if (cycle !== undefined) {
      violations.push(
        `transition dependency cycle: ${cycle.map((path) => relative(TRANSITION_ROOT, path)).join(" -> ")}`,
      );
    }

    assertEquals(violations.sort(), []);
  },
});

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
const FIRST_PERSON_ASSET_ROOT = resolve(SOURCE_ROOT, "game/presentation/first_person/assets");
const FIRST_PERSON_ASSET_PUBLIC_MODULE = resolve(FIRST_PERSON_ASSET_ROOT, "mod.ts");
const LEGACY_FIRST_PERSON_ASSET_MODULES = new Set([
  resolve(SOURCE_ROOT, "game/presentation/first_person/assets.ts"),
]);
const SEALED_ENGINE_MODULES = ["audio", "canvas", "input", "raycast"].map((name) => {
  const root = resolve(SOURCE_ROOT, `engine/${name}`);
  return { name, root, publicModule: resolve(root, "mod.ts") };
});
const PRESENTATION_RENDER_COORDINATOR = resolve(SOURCE_ROOT, "game/presentation/render.ts");
const PRESENTATION_RENDER_PASSES = [
  "@/src/game/presentation/overlay_pass.ts",
  "@/src/game/presentation/session_pass.ts",
  "@/src/game/presentation/shell_pass.ts",
];
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

async function sealedModuleViolations(
  root: string,
  publicModule: string,
  legacyModules: ReadonlySet<string>,
): Promise<string[]> {
  const violations: string[] = [];
  const files = await sourceFiles(SOURCE_ROOT);
  const moduleFiles = new Set(files.filter((path) => path.startsWith(`${root}/`)));
  const moduleDependencies = new Map([...moduleFiles].map((path) => [path, [] as string[]]));
  for (const legacyPath of legacyModules) {
    if (files.includes(legacyPath)) violations.push(`${relative(SOURCE_ROOT, legacyPath)} still exists`);
  }

  for (const sourcePath of files) {
    const importer = relative(SOURCE_ROOT, sourcePath);
    const isModule = sourcePath.startsWith(`${root}/`);

    for (const specifier of importSpecifiers(await Deno.readTextFile(sourcePath))) {
      const importedPath = importedSourcePath(sourcePath, specifier);
      if (importedPath === undefined) continue;
      if (isModule && moduleFiles.has(importedPath)) {
        moduleDependencies.get(sourcePath)!.push(importedPath);
      }
      if (legacyModules.has(importedPath)) {
        violations.push(`${importer} imports legacy ${specifier}`);
        continue;
      }
      if (isModule && importedPath === publicModule) {
        violations.push(`${importer} imports its public module`);
        continue;
      }
      if (!isModule && importedPath.startsWith(`${root}/`) && importedPath !== publicModule) {
        violations.push(`${importer} bypasses ${relative(SOURCE_ROOT, publicModule)} via ${specifier}`);
      }
    }
  }

  const cycle = dependencyCycle(moduleDependencies);
  if (cycle !== undefined) {
    violations.push(
      `module dependency cycle: ${cycle.map((path) => relative(root, path)).join(" -> ")}`,
    );
  }
  return violations;
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
    const violations = await sealedModuleViolations(
      TRANSITION_ROOT,
      TRANSITION_PUBLIC_MODULE,
      LEGACY_TRANSITION_MODULES,
    );
    assertEquals(violations.sort(), []);
  },
});

Deno.test({
  name: "first-person assets expose one sealed public boundary",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const violations = await sealedModuleViolations(
      FIRST_PERSON_ASSET_ROOT,
      FIRST_PERSON_ASSET_PUBLIC_MODULE,
      LEGACY_FIRST_PERSON_ASSET_MODULES,
    );
    assertEquals(violations.sort(), []);
  },
});

Deno.test({
  name: "engine modules expose one sealed public boundary",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const violations: string[] = [];
    for (const module of SEALED_ENGINE_MODULES) {
      const moduleViolations = await sealedModuleViolations(module.root, module.publicModule, new Set());
      violations.push(...moduleViolations.map((violation) => `${module.name}: ${violation}`));
    }
    assertEquals(violations.sort(), []);
  },
});

Deno.test({
  name: "presentation render coordinator delegates concrete passes",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const specifiers = importSpecifiers(await Deno.readTextFile(PRESENTATION_RENDER_COORDINATOR));
    const passImports = specifiers.filter((specifier) => PRESENTATION_RENDER_PASSES.includes(specifier));
    const directImplementationImports = specifiers.filter((specifier) =>
      specifier.includes("/game/presentation/ui/") ||
      specifier.includes("/game/presentation/top_down/") ||
      specifier === "@/src/game/presentation/preload.ts"
    );

    assertEquals(passImports.sort(), [...PRESENTATION_RENDER_PASSES].sort());
    assertEquals(directImplementationImports.sort(), []);

    const forbiddenPassImports: string[] = [];
    for (const passSpecifier of PRESENTATION_RENDER_PASSES) {
      const passPath = resolve(SOURCE_ROOT, passSpecifier.slice("@/src/".length));
      const forbiddenSpecifiers = new Set([
        "@/src/game/presentation/render.ts",
        ...PRESENTATION_RENDER_PASSES.filter((specifier) => specifier !== passSpecifier),
      ]);
      for (const imported of importSpecifiers(await Deno.readTextFile(passPath))) {
        if (forbiddenSpecifiers.has(imported)) forbiddenPassImports.push(`${passSpecifier} imports ${imported}`);
      }
    }
    assertEquals(forbiddenPassImports, []);
  },
});

import { assertEquals } from "@std/assert";
import { dirname, relative, resolve } from "@std/path";

const SOURCE_ROOT = resolve(Deno.cwd(), "src");
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

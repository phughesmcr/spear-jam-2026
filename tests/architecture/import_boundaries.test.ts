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
const LEGACY_APPLICATION_RUNTIME = resolve(SOURCE_ROOT, "app/runtime.ts");
const LEGACY_SESSION_LIFECYCLE = resolve(SOURCE_ROOT, "app/session_lifecycle.ts");
const PRESENTATION_RUNTIME = resolve(SOURCE_ROOT, "app/presentation_runtime.ts");
const AUDIO_RUNTIME = resolve(SOURCE_ROOT, "app/audio_runtime.ts");
const GAME_AUDIO_ROOT = resolve(SOURCE_ROOT, "game/audio");
const GAME_AUDIO_PUBLIC_MODULE = resolve(GAME_AUDIO_ROOT, "mod.ts");
const WEB_AUDIO_ROOT = resolve(SOURCE_ROOT, "platform/web/audio");
const WEB_AUDIO_PUBLIC_MODULE = resolve(WEB_AUDIO_ROOT, "mod.ts");
const LEGACY_AUDIO_MODULES = new Set([
  resolve(SOURCE_ROOT, "game/presentation/audio.ts"),
]);
const SIMULATION_ROOT = resolve(SOURCE_ROOT, "game/simulation");
const SIMULATION_PUBLIC_MODULE = resolve(SIMULATION_ROOT, "mod.ts");
const LEGACY_SIMULATION_OUTPUT_MODULES = new Set([
  resolve(SIMULATION_ROOT, "drawable_kind.ts"),
]);
const SPAWN_ROOT = resolve(SIMULATION_ROOT, "spawn");
const SPAWN_PUBLIC_MODULE = resolve(SPAWN_ROOT, "mod.ts");
const SPAWN_MODULES = [
  "actors.ts",
  "ambient.ts",
  "effects.ts",
  "map_entities.ts",
  "pickups.ts",
  "structures.ts",
].map((name) => resolve(SPAWN_ROOT, name));
const LEGACY_PREFAB_MODULES = new Set([
  resolve(SIMULATION_ROOT, "prefabs.ts"),
]);
const PRESENTATION_ROOT = resolve(SOURCE_ROOT, "game/presentation");
const GAME_SESSION = resolve(SOURCE_ROOT, "game/simulation/session.ts");
const GAME_SESSION_MODULES = [
  "command_resolution.ts",
  "map_lifecycle.ts",
  "output_readers.ts",
  "progression_statistics.ts",
].map((name) => resolve(SIMULATION_ROOT, `session/${name}`));
const LEGACY_GAME_SESSION_LIFECYCLE = resolve(SIMULATION_ROOT, "session/lifecycle.ts");
const GAME_EXECUTION = resolve(SOURCE_ROOT, "app/game_execution.ts");
const APPLICATION_START = resolve(SOURCE_ROOT, "app/start.ts");
const CAMPAIGN_MODULE = resolve(SOURCE_ROOT, "game/world/campaign.ts");
const GAME_CATALOG_MODULE = resolve(SOURCE_ROOT, "game/content/catalog.ts");
const SHIPPED_GAME_MODULE = resolve(SOURCE_ROOT, "game/content/shipped.ts");
const CONTENT_SOURCE_ROOT = resolve(SOURCE_ROOT, "game/content/source");
const CAMPAIGN_MAP_ROOT = resolve(SOURCE_ROOT, "game/content/maps");
const LEGACY_CAMPAIGN_MODULES = new Set([
  resolve(SOURCE_ROOT, "game/content/map_schema.ts"),
  resolve(SOURCE_ROOT, "game/content/maps/mod.ts"),
  resolve(SOURCE_ROOT, "game/world/destinations.ts"),
  resolve(SOURCE_ROOT, "game/world/validation.ts"),
]);
const CAMPAIGN_INDEPENDENT_WORLD_MODULES = [
  "grid.ts",
  "map.ts",
  "terrain_flags.ts",
  "terrain_palette.ts",
].map((name) => resolve(SOURCE_ROOT, `game/world/${name}`));
const PRESENTATION_RUNTIME_IMPORTS = new Set([
  "@/src/game/content/catalog.ts",
  "@/src/game/model/presentation_state.ts",
  "@/src/game/model/render_settings.ts",
  "@/src/game/model/transition/mod.ts",
  "@/src/game/presentation/canvas_size.ts",
  "@/src/game/presentation/first_person/renderer.ts",
  "@/src/game/presentation/frame_scratch.ts",
  "@/src/game/presentation/preload.ts",
  "@/src/game/presentation/render.ts",
  "@/src/game/presentation/session_view.ts",
]);
const AUDIO_RUNTIME_IMPORTS = new Set([
  "@/src/game/content/catalog.ts",
  "@/src/engine/audio/mod.ts",
  "@/src/game/audio/mod.ts",
  "@/src/platform/web/audio/mod.ts",
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
  name: "game catalog owns shipped content and campaign remains a lower-level compiler",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const files = new Set(await sourceFiles(SOURCE_ROOT));
    const violations: string[] = [];

    if (!files.has(CAMPAIGN_MODULE)) {
      violations.push("game/world/campaign.ts is missing");
    } else {
      const source = await Deno.readTextFile(CAMPAIGN_MODULE);
      const exportedNames = [...source.matchAll(
        /^export\s+(?:type|interface|class|function|const)\s+([A-Za-z_$][\w$]*)/gm,
      )].map((match) => match[1]!).sort();
      const expectedExports = ["Campaign", "CampaignDestination", "compileCampaign"].sort();
      if (exportedNames.join(",") !== expectedExports.join(",")) {
        violations.push(`game/world/campaign.ts exports ${exportedNames.join(", ")}`);
      }
    }
    if (!files.has(GAME_CATALOG_MODULE)) violations.push("game/content/catalog.ts is missing");
    if (!files.has(SHIPPED_GAME_MODULE)) violations.push("game/content/shipped.ts is missing");
    for (const legacyPath of LEGACY_CAMPAIGN_MODULES) {
      if (files.has(legacyPath)) violations.push(`${relative(SOURCE_ROOT, legacyPath)} still exists`);
    }

    for (const sourcePath of files) {
      for (const specifier of importSpecifiers(await Deno.readTextFile(sourcePath))) {
        const importedPath = importedSourcePath(sourcePath, specifier);
        if (importedPath === undefined) continue;
        if (LEGACY_CAMPAIGN_MODULES.has(importedPath)) {
          violations.push(`${relative(SOURCE_ROOT, sourcePath)} imports legacy ${specifier}`);
        }
        if (
          importedPath.startsWith(`${CAMPAIGN_MAP_ROOT}/`) &&
          importedPath.endsWith(".json") &&
          sourcePath !== SHIPPED_GAME_MODULE
        ) {
          violations.push(`${relative(SOURCE_ROOT, sourcePath)} imports shipped map ${specifier}`);
        }
        if (
          importedPath.startsWith(`${CONTENT_SOURCE_ROOT}/`) &&
          !sourcePath.startsWith(`${CONTENT_SOURCE_ROOT}/`) &&
          sourcePath !== SHIPPED_GAME_MODULE
        ) {
          violations.push(`${relative(SOURCE_ROOT, sourcePath)} imports private authored source ${specifier}`);
        }
      }
    }

    for (const modulePath of CAMPAIGN_INDEPENDENT_WORLD_MODULES) {
      const imports = importSpecifiers(await Deno.readTextFile(modulePath));
      if (imports.includes("@/src/game/world/campaign.ts")) {
        violations.push(`${relative(SOURCE_ROOT, modulePath)} imports the campaign boundary`);
      }
    }

    for (const sourcePath of files) {
      const imports = importSpecifiers(await Deno.readTextFile(sourcePath));
      if (imports.includes("@/src/game/content/shipped.ts") && sourcePath !== APPLICATION_START) {
        violations.push(`${relative(SOURCE_ROOT, sourcePath)} imports SHIPPED_GAME`);
      }
    }

    const catalogImports = importSpecifiers(await Deno.readTextFile(GAME_CATALOG_MODULE));
    if (catalogImports.includes("@/src/game/content/shipped.ts")) {
      violations.push("game/content/catalog.ts imports shipped content");
    }
    if (catalogImports.some((specifier) => specifier.startsWith("@/src/game/content/source/"))) {
      violations.push("game/content/catalog.ts imports private authored source");
    }

    const forbiddenLegacyExports: Readonly<Record<string, readonly string[]>> = {
      "game/content/audio/music.ts": ["MUSIC_TRACKS", "SHIPPED_MAP_TRACKS", "musicTrackForMap"],
      "game/content/audio/sounds.ts": ["SOUND_CATALOG", "soundCatalogEntry"],
      "game/content/dialogue/voices.ts": ["VOICE_CATALOG", "voiceSource"],
      "game/content/dialogue/trees.ts": [
        "validateDialogueTrees",
        "dialogueTreeStart",
        "dialogueTreeNode",
        "dialogueTreeCode",
        "dialogueTreeForCode",
      ],
      "game/content/enemies.ts": [
        "DEFAULT_ENEMY_ARCHETYPE",
        "DEFAULT_ENEMY_BEHAVIOR_POLICY",
        "DEFAULT_ENEMY_SENSES",
        "enemyArchetypeKey",
        "enemyArchetypeForKey",
        "enemyArchetypeForCode",
        "enemyCatalogEntry",
        "spriteIdForEnemyArchetype",
      ],
      "game/content/names.ts": ["displayNameText", "displayNameCode", "displayNameForCode"],
      "game/content/examine_text.ts": ["examineText", "examineTextCode", "examineTextIdForCode"],
      "game/content/items.ts": ["itemKindForCode", "ITEM_KIND_BY_CONTENT_KEY"],
      "game/content/story.ts": [
        "storyEventDefinition",
        "storyEventIdFor",
        "storyTargetIdFor",
        "storyEventCode",
        "storyEventForCode",
        "storyTargetCode",
        "storyTargetForCode",
      ],
      "game/content/sprites.ts": [
        "topDownSpriteAppearance",
        "spriteIdForDisplayName",
        "spriteIdForItem",
        "spriteIdForDecoration",
      ],
      "game/content/weapons.ts": ["playerWeaponSpec"],
      "game/model/sound.ts": ["soundIdCode", "soundIdForCode"],
    };
    for (const [path, names] of Object.entries(forbiddenLegacyExports)) {
      const source = await Deno.readTextFile(resolve(SOURCE_ROOT, path));
      for (const name of names) {
        if (new RegExp(`\\bexport\\s+(?:const|function)\\s+${name}\\b`).test(source)) {
          violations.push(`${path} still exports displaced ${name}`);
        }
      }
    }

    assertEquals(violations.sort(), []);
  },
});

Deno.test({
  name: "application output channels and game execution have discrete owners",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const files = new Set(await sourceFiles(SOURCE_ROOT));
    const violations: string[] = [];
    if (files.has(LEGACY_APPLICATION_RUNTIME)) violations.push("app/runtime.ts still exists");
    if (files.has(LEGACY_SESSION_LIFECYCLE)) violations.push("app/session_lifecycle.ts still exists");
    if (!files.has(PRESENTATION_RUNTIME)) violations.push("app/presentation_runtime.ts is missing");
    if (!files.has(AUDIO_RUNTIME)) violations.push("app/audio_runtime.ts is missing");
    if (!files.has(GAME_EXECUTION)) violations.push("app/game_execution.ts is missing");

    const startSource = await Deno.readTextFile(APPLICATION_START);
    const startImports = importSpecifiers(startSource);
    for (
      const required of [
        "@/src/app/presentation_runtime.ts",
        "@/src/app/audio_runtime.ts",
        "@/src/app/game_execution.ts",
      ]
    ) {
      if (!startImports.includes(required)) violations.push(`app/start.ts does not import ${required}`);
    }
    for (
      const forbidden of [
        "@/src/app/runtime.ts",
        "@/src/app/session_lifecycle.ts",
        "@/src/game/simulation/session.ts",
        "@/src/engine/random.ts",
        "@/src/game/content/audio/music.ts",
        "@/src/game/world/direction.ts",
      ]
    ) {
      if (startImports.includes(forbidden)) violations.push(`app/start.ts imports ${forbidden}`);
    }
    if (/\bswitch\s*\(\s*effect\.type\s*\)/.test(startSource)) {
      violations.push("app/start.ts interprets game effects");
    }
    if (/\bSESSION_TRANSITIONS\b/.test(startSource)) {
      violations.push("app/start.ts owns session transition dispatch");
    }
    if (/\bpreviousViewMode\b|\bcompletion\.type\b/.test(startSource)) {
      violations.push("app/start.ts interprets transition consequences");
    }
    if (/\.warmMapAssets\s*\(/.test(startSource)) {
      violations.push("app/start.ts directly warms transition-selected map assets");
    }

    if (files.has(PRESENTATION_RUNTIME)) {
      const presentationImports = importSpecifiers(await Deno.readTextFile(PRESENTATION_RUNTIME));
      for (const specifier of presentationImports) {
        if (!PRESENTATION_RUNTIME_IMPORTS.has(specifier)) {
          violations.push(`app/presentation_runtime.ts imports unapproved ${specifier}`);
        }
      }
    }

    if (files.has(AUDIO_RUNTIME)) {
      const audioImports = importSpecifiers(await Deno.readTextFile(AUDIO_RUNTIME));
      for (const specifier of audioImports) {
        if (!AUDIO_RUNTIME_IMPORTS.has(specifier)) {
          violations.push(`app/audio_runtime.ts imports unapproved ${specifier}`);
        }
      }
    }

    const presentationSessionSource = await Deno.readTextFile(
      resolve(SOURCE_ROOT, "game/presentation/session_view.ts"),
    );
    for (
      const forbiddenName of [
        "AudioWorldSession",
        "SoundEmitterVisitor",
        "EnemyIdleSoundSourceVisitor",
      ]
    ) {
      if (presentationSessionSource.includes(forbiddenName)) {
        violations.push(`game/presentation/session_view.ts owns ${forbiddenName}`);
      }
    }

    if (files.has(GAME_EXECUTION)) {
      const executionSource = await Deno.readTextFile(GAME_EXECUTION);
      const executionImports = importSpecifiers(executionSource);
      if (executionImports.includes("@/src/app/session_lifecycle.ts")) {
        violations.push("app/game_execution.ts imports displaced session lifecycle");
      }
      if (!/\bswitch\s*\(\s*effect\.type\s*\)/.test(executionSource)) {
        violations.push("app/game_execution.ts does not interpret game effects");
      }
      for (
        const forbidden of [
          "@/src/app/input.ts",
          "@/src/game/presentation/input_routing.ts",
          "@/src/platform/web/canvas.ts",
        ]
      ) {
        if (executionImports.includes(forbidden)) {
          violations.push(`app/game_execution.ts imports ${forbidden}`);
        }
      }
    }

    const applicationRoot = resolve(SOURCE_ROOT, "app");
    for (const sourcePath of files) {
      if (!sourcePath.startsWith(`${applicationRoot}/`) || sourcePath === GAME_EXECUTION) continue;
      const source = await Deno.readTextFile(sourcePath);
      for (const primitive of ["createGameSession", ".loadMap(", ".retryMap("]) {
        if (source.includes(primitive)) {
          violations.push(`${relative(SOURCE_ROOT, sourcePath)} owns session lifecycle primitive ${primitive}`);
        }
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
  name: "audio verticals expose sealed public boundaries",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const violations = [
      ...await sealedModuleViolations(
        GAME_AUDIO_ROOT,
        GAME_AUDIO_PUBLIC_MODULE,
        LEGACY_AUDIO_MODULES,
      ),
      ...await sealedModuleViolations(
        WEB_AUDIO_ROOT,
        WEB_AUDIO_PUBLIC_MODULE,
        new Set(),
      ),
    ];
    assertEquals(violations.sort(), []);
  },
});

Deno.test({
  name: "simulation exposes one sealed public boundary without owning output contracts",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const violations = await sealedModuleViolations(
      SIMULATION_ROOT,
      SIMULATION_PUBLIC_MODULE,
      LEGACY_SIMULATION_OUTPUT_MODULES,
    );

    for (const root of [PRESENTATION_ROOT, GAME_AUDIO_ROOT]) {
      for (const sourcePath of await sourceFiles(root)) {
        for (const specifier of importSpecifiers(await Deno.readTextFile(sourcePath))) {
          const importedPath = importedSourcePath(sourcePath, specifier);
          if (importedPath?.startsWith(`${SIMULATION_ROOT}/`)) {
            violations.push(`${relative(SOURCE_ROOT, sourcePath)} imports ${specifier}`);
          }
        }
      }
    }

    assertEquals(violations.sort(), []);
  },
});

Deno.test({
  name: "game session facade delegates to concrete responsibility owners",
  permissions: { read: [SOURCE_ROOT] },
  fn: async () => {
    const files = new Set(await sourceFiles(SOURCE_ROOT));
    const violations: string[] = [];
    for (const modulePath of GAME_SESSION_MODULES) {
      if (!files.has(modulePath)) violations.push(`${relative(SOURCE_ROOT, modulePath)} is missing`);
    }
    if (files.has(LEGACY_GAME_SESSION_LIFECYCLE)) {
      violations.push(`${relative(SOURCE_ROOT, LEGACY_GAME_SESSION_LIFECYCLE)} still exists`);
    }

    const source = await Deno.readTextFile(GAME_SESSION);
    const imports = new Set(importSpecifiers(source));
    for (const modulePath of GAME_SESSION_MODULES) {
      const specifier = `@/src/${relative(SOURCE_ROOT, modulePath)}`;
      if (!imports.has(specifier)) violations.push(`game/simulation/session.ts does not import ${specifier}`);
    }
    for (
      const forbidden of [
        "@/src/game/simulation/components.ts",
        "@/src/game/simulation/drawables.ts",
        "@/src/game/simulation/prefabs.ts",
        "@/src/game/simulation/progression.ts",
        "@/src/game/simulation/runtime.ts",
        "@/src/game/simulation/session/lifecycle.ts",
        "@/src/game/simulation/session/sprite_animations.ts",
        "@/src/game/simulation/session/story_actions.ts",
        "@/src/game/simulation/sound_cues.ts",
        "@/src/game/simulation/sounds.ts",
        "@/src/game/simulation/turn/actions.ts",
        "@/src/game/simulation/turn/transaction.ts",
      ]
    ) {
      if (imports.has(forbidden)) violations.push(`game/simulation/session.ts imports ${forbidden}`);
    }
    for (
      const displaced of [
        "capturePlayerProgressionCheckpoint",
        "commitTurnTransaction",
        "copyMetadata",
        "createDrawableReaders",
        "createSoundReaders",
        "levelMoves",
        "pendingDialogueStoryEvent",
        "runTurnTransaction",
        "soundCuesForEvents",
        "this.now",
        "this.random",
      ]
    ) {
      if (source.includes(displaced)) violations.push(`game/simulation/session.ts still owns ${displaced}`);
    }

    assertEquals(violations.sort(), []);
  },
});

Deno.test({
  name: "simulation spawn vertical exposes one sealed public boundary",
  permissions: { read: [SOURCE_ROOT, resolve(Deno.cwd(), "tests")] },
  fn: async () => {
    const violations = await sealedModuleViolations(SPAWN_ROOT, SPAWN_PUBLIC_MODULE, LEGACY_PREFAB_MODULES);
    const sourceFilesSet = new Set(await sourceFiles(SOURCE_ROOT));
    if (!sourceFilesSet.has(SPAWN_PUBLIC_MODULE)) violations.push("game/simulation/spawn/mod.ts is missing");
    for (const modulePath of SPAWN_MODULES) {
      if (!sourceFilesSet.has(modulePath)) violations.push(`${relative(SOURCE_ROOT, modulePath)} is missing`);
    }

    const integrationModules = [
      resolve(SIMULATION_ROOT, "session/map_lifecycle.ts"),
      resolve(SIMULATION_ROOT, "session/sprite_animations.ts"),
    ];
    for (const modulePath of integrationModules) {
      const imports = importSpecifiers(await Deno.readTextFile(modulePath));
      if (!imports.includes("@/src/game/simulation/spawn/mod.ts")) {
        violations.push(`${relative(SOURCE_ROOT, modulePath)} does not import the spawn public module`);
      }
    }

    const testRoot = resolve(Deno.cwd(), "tests");
    for (const testPath of await sourceFiles(testRoot)) {
      for (const specifier of importSpecifiers(await Deno.readTextFile(testPath))) {
        const importedPath = importedSourcePath(testPath, specifier);
        if (importedPath === undefined) continue;
        if (LEGACY_PREFAB_MODULES.has(importedPath)) {
          violations.push(`${relative(testRoot, testPath)} imports legacy ${specifier}`);
        } else if (importedPath.startsWith(`${SPAWN_ROOT}/`) && importedPath !== SPAWN_PUBLIC_MODULE) {
          violations.push(`${relative(testRoot, testPath)} bypasses game/simulation/spawn/mod.ts via ${specifier}`);
        }
      }
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

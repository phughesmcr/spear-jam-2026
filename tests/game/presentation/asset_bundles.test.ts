import type { ImageAssetResult } from "@/src/engine/canvas/mod.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import {
  type AssetBundleDependencies,
  type AssetBundleRequest,
  selectAssetBundleJobs,
} from "@/src/game/presentation/asset_bundles.ts";
import { createPresentationUiAssets } from "@/src/game/presentation/asset_view.ts";
import type { FirstPersonAssetLoader, FirstPersonAssetView } from "@/src/game/presentation/first_person/assets/mod.ts";
import { assertEquals } from "@std/assert";

const BASE_LEVEL_IMAGES = [
  "ammo_bar.png",
  "combat_stats_box.png",
  "d20_faces.png",
  "health_bar.png",
  "key_bar_ryb.png",
  "verb_menu_cutout.png",
  "verb_menu_glow_attack.png",
  "verb_menu_glow_examine.png",
  "verb_menu_glow_open.png",
  "verb_menu_glow_talk.png",
  "verb_menu_glow_use.png",
  "weapon_1_active.png",
  "weapon_1_idle.png",
  "weapon_2_active.png",
  "weapon_2_idle.png",
  "weapon_3_active.png",
  "weapon_3_idle.png",
] as const;

const ALL_NON_SHELL_IMAGES = [
  ...BASE_LEVEL_IMAGES,
  "dialogue_john.png",
  "endscreen.png",
  "spear_reveal.png",
].sort();

Deno.test("shell bundle prepares exactly title and help images", async () => {
  const result = await runBundle({ kind: "shell" });

  assertEquals(result.jobCount, 1);
  assertEquals(result.imageNames, ["help.png", "titlescreen_mobile.png"]);
  assertEquals(result.loader.calls, []);
});

Deno.test("UI bundle jobs report changes only for ready authored images", async () => {
  const result = await runBundle({ kind: "shell" }, ["help.png"]);

  assertEquals(result.resultKinds.sort(), ["ready", "unavailable"]);
  assertEquals(result.changeCount, 1);
});

Deno.test("UI bundle jobs announce each ready-view transition only once", async () => {
  const document = new LoadingDocument([]);
  const dependencies: AssetBundleDependencies = {
    document: document as unknown as Document,
    view: {
      ui: createPresentationUiAssets(),
      firstPerson: {} as FirstPersonAssetView,
    },
    firstPersonLoader: new RecordingFirstPersonLoader(),
    content: SHIPPED_GAME.presentation,
    simulationContent: SHIPPED_GAME.simulation,
    announcedReadyAssets: new WeakSet(),
  };
  const [job] = selectAssetBundleJobs({ kind: "shell" }, dependencies);
  if (job === undefined) throw new Error("Shell bundle job is missing.");
  let changeCount = 0;

  await Promise.all([
    job(() => changeCount += 1),
    job(() => changeCount += 1),
  ]);
  assertEquals(changeCount, 2);
  assertEquals(document.sources.length, 2);

  await job(() => changeCount += 1);
  assertEquals(changeCount, 2);
  assertEquals(document.sources.length, 2);
});

Deno.test("level bundle prepares exact critical UI and first-person sprites", async () => {
  const level = SHIPPED_GAME.levels.get("Boot Sector");
  const result = await runBundle({ kind: "level", level });

  assertEquals(result.jobCount, 2);
  assertEquals(result.imageNames, [...BASE_LEVEL_IMAGES, "dialogue_john.png"].sort());
  assertEquals(result.loader.calls, ["required"]);
  assertEquals(result.loader.requiredMap, level.map);
  assertEquals(
    [...result.loader.requiredSprites].sort((a, b) => a - b),
    [
      SpriteId.John,
      SpriteId.DigitalDog,
      SpriteId.UplinkTerminal,
      SpriteId.HealthPatch,
      SpriteId.RedKey,
      SpriteId.Weapon2,
      SpriteId.UplinkCode,
      SpriteId.Corpse,
      SpriteId.PistolAmmo,
      SpriteId.DecorServerPile,
      SpriteId.DecorCyborg,
      SpriteId.DecorCeilingHook,
      SpriteId.DecorCeilingLight,
      SpriteId.DecorCeilingWires,
    ].sort((a, b) => a - b),
  );
});

Deno.test("level dialogue images are selected only when authored on that level", async () => {
  const noDialogue = await runBundle({
    kind: "level",
    level: SHIPPED_GAME.levels.get("Data Conduit"),
  });
  const spearReveal = await runBundle({
    kind: "level",
    level: SHIPPED_GAME.levels.get("The Nexus"),
  });

  assertEquals(noDialogue.imageNames, [...BASE_LEVEL_IMAGES]);
  assertEquals(spearReveal.imageNames, [...BASE_LEVEL_IMAGES, "spear_reveal.png"].sort());
});

Deno.test("deferred UI is the exact complement of each level-critical UI bundle", async () => {
  const expectations = [
    ["Boot Sector", ["endscreen.png", "spear_reveal.png"]],
    ["Data Conduit", ["dialogue_john.png", "endscreen.png", "spear_reveal.png"]],
    ["The Nexus", ["dialogue_john.png", "endscreen.png"]],
  ] as const;

  for (const [mapName, expectedDeferred] of expectations) {
    const level = SHIPPED_GAME.levels.get(mapName);
    const critical = await runBundle({ kind: "level", level });
    const deferred = await runBundle({ kind: "deferred", level });

    assertEquals(deferred.jobCount, 2);
    assertEquals(deferred.loader.calls, ["remaining"]);
    assertEquals(deferred.imageNames, [...expectedDeferred].sort());
    assertEquals(
      critical.imageNames.filter((name) => deferred.imageNames.includes(name)),
      [],
    );
    assertEquals([...critical.imageNames, ...deferred.imageNames].sort(), ALL_NON_SHELL_IMAGES);
  }
});

async function runBundle(request: AssetBundleRequest, unavailableNames: readonly string[] = []): Promise<{
  readonly imageNames: readonly string[];
  readonly jobCount: number;
  readonly loader: RecordingFirstPersonLoader;
  readonly resultKinds: Array<ImageAssetResult["kind"]>;
  readonly changeCount: number;
}> {
  const document = new LoadingDocument(unavailableNames);
  const loader = new RecordingFirstPersonLoader();
  const dependencies: AssetBundleDependencies = {
    document: document as unknown as Document,
    view: {
      ui: createPresentationUiAssets(),
      firstPerson: {} as FirstPersonAssetView,
    },
    firstPersonLoader: loader,
    content: SHIPPED_GAME.presentation,
    simulationContent: SHIPPED_GAME.simulation,
    announcedReadyAssets: new WeakSet(),
  };
  const jobs = selectAssetBundleJobs(request, dependencies);
  let changeCount = 0;

  const results = await Promise.all(jobs.map((job) => job(() => changeCount += 1)));

  return {
    imageNames: document.sources.map(fileName).sort(),
    jobCount: jobs.length,
    loader,
    resultKinds: results.flat().map((result) => result.kind),
    changeCount,
  };
}

function fileName(source: string): string {
  return new URL(source).pathname.split("/").at(-1) ?? source;
}

class RecordingFirstPersonLoader implements FirstPersonAssetLoader {
  readonly calls: Array<"required" | "remaining"> = [];
  requiredMap: Parameters<FirstPersonAssetLoader["loadRequired"]>[1] | undefined;
  requiredSprites: ReadonlySet<number> = new Set();

  loadRequired(
    _document: Document,
    map: Parameters<FirstPersonAssetLoader["loadRequired"]>[1],
    spriteIds: Parameters<FirstPersonAssetLoader["loadRequired"]>[2],
    onChange?: () => void,
  ): Promise<readonly ImageAssetResult[]> {
    this.calls.push("required");
    this.requiredMap = map;
    this.requiredSprites = spriteIds;
    onChange?.();
    return Promise.resolve([]);
  }

  loadRemaining(
    _document: Document,
    onChange?: () => void,
  ): Promise<readonly ImageAssetResult[]> {
    this.calls.push("remaining");
    onChange?.();
    return Promise.resolve([]);
  }
}

class LoadingDocument {
  readonly sources: string[] = [];
  private readonly unavailableNames: ReadonlySet<string>;

  constructor(unavailableNames: readonly string[]) {
    this.unavailableNames = new Set(unavailableNames);
  }

  createElement(tagName: string): LoadingImage {
    if (tagName !== "img") throw new Error(`Unexpected element ${tagName}.`);
    return new LoadingImage(this.sources, this.unavailableNames);
  }
}

class LoadingImage {
  decoding: "async" | "auto" | "sync" = "auto";
  private readonly sources: string[];
  private readonly loadListeners: EventListener[] = [];
  private readonly errorListeners: EventListener[] = [];
  private readonly unavailableNames: ReadonlySet<string>;
  private source = "";

  constructor(sources: string[], unavailableNames: ReadonlySet<string>) {
    this.sources = sources;
    this.unavailableNames = unavailableNames;
  }

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    this.sources.push(value);
    queueMicrotask(() => {
      const unavailable = this.unavailableNames.has(fileName(value));
      const event = new Event(unavailable ? "error" : "load");
      const listeners = unavailable ? this.errorListeners : this.loadListeners;
      for (const listener of listeners) listener(event);
    });
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (typeof listener !== "function") return;
    if (type === "load") this.loadListeners.push(listener);
    if (type === "error") this.errorListeners.push(listener);
  }

  decode(): Promise<void> {
    return Promise.resolve();
  }
}

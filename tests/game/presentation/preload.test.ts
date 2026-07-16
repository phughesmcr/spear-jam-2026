import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import type { FirstPersonRenderer } from "@/src/game/presentation/first_person/renderer.ts";
import {
  criticalSpriteIdsForMap,
  mapNeedsDialogueAssets,
  mapNeedsSpearRevealAsset,
  spriteIdsForEntity,
  warmDeferredAssets,
  warmMapAssets,
  warmShellAssets,
} from "@/src/game/presentation/preload.ts";
import { assert, assertEquals } from "@std/assert";

const CONTENT = SHIPPED_GAME.presentation;
const SIMULATION_CONTENT = SHIPPED_GAME.simulation;

function spriteIds(entity: Parameters<typeof spriteIdsForEntity>[0]) {
  return spriteIdsForEntity(entity, SIMULATION_CONTENT, CONTENT);
}

Deno.test("asset warm lifecycle separates shell, map-critical, and deferred presentation assets", async () => {
  const document = new LoadingDocument();
  const firstPersonStages: string[] = [];
  const errors: unknown[] = [];
  const renderer: FirstPersonRenderer = {
    preloadMapAssets: () => {
      firstPersonStages.push("map-critical");
      return Promise.resolve();
    },
    warmRemainingAssets: () => {
      firstPersonStages.push("deferred");
      return Promise.resolve();
    },
    reset(): void {},
    bump(): void {},
    render(): void {},
  };

  await withImmediateIdleCallback(async () => {
    warmShellAssets(
      document as unknown as Document,
      (error) => errors.push(error),
    );
    warmMapAssets(
      document as unknown as Document,
      renderer,
      SHIPPED_GAME.levels.start,
      CONTENT,
      SIMULATION_CONTENT,
      (error) => errors.push(error),
    );
    await flushWarmWork();

    const criticalSources = [...document.sources];
    assert(criticalSources.some((source) => source.endsWith("/assets/game/titlescreen_mobile.png")));
    assert(criticalSources.some((source) => source.endsWith("/assets/game/help.png")));
    assert(criticalSources.some((source) => source.endsWith("/assets/game/ui/health_bar.png")));
    assert(criticalSources.some((source) => source.endsWith("/assets/game/ui/weapon_1_idle.png")));
    assert(criticalSources.some((source) => source.endsWith("/assets/game/ui/dialogue_john.png")));
    assertEquals(firstPersonStages, ["map-critical"]);

    warmDeferredAssets(
      document as unknown as Document,
      renderer,
      SHIPPED_GAME.levels.start,
      (error) => errors.push(error),
    );
    await flushWarmWork();

    const deferredSources = document.sources.slice(criticalSources.length);
    assert(deferredSources.some((source) => source.endsWith("/assets/game/endscreen.png")));
    assert(deferredSources.some((source) => source.endsWith("/assets/game/ui/spear_reveal.png")));
    assertEquals(deferredSources.some((source) => source.endsWith("/assets/game/help.png")), false);
    assertEquals(firstPersonStages, ["map-critical", "deferred"]);
    assertEquals(errors, []);
  });
});

Deno.test("spriteIdsForEntity maps authored prefabs to sprite ids", () => {
  assertEquals(spriteIds({ prefab: "player", x: 0, y: 0, dir: 0 }), []);
  assertEquals(spriteIds({ prefab: "npc", x: 0, y: 0, dir: 0, displayName: "john" }), [
    SpriteId.John,
  ]);
  assertEquals(spriteIds({ prefab: "enemy", x: 0, y: 0, dir: 0, archetype: "meleeDog" }), [
    SpriteId.DigitalDog,
  ]);
  assertEquals(spriteIds({ prefab: "key", x: 0, y: 0, color: "red" }), [SpriteId.RedKey]);
  assertEquals(spriteIds({ prefab: "uplinkCode", x: 0, y: 0 }), [SpriteId.UplinkCode]);
  assertEquals(spriteIds({ prefab: "uplinkTerminal", x: 0, y: 0, goto: "victory" }), [
    SpriteId.UplinkTerminal,
  ]);
  assertEquals(spriteIds({ prefab: "weaponPickup", x: 0, y: 0, slot: 2 }), [SpriteId.Weapon2]);
  assertEquals(spriteIds({ prefab: "item", x: 0, y: 0, item: "healthPatch", amount: 1 }), [
    SpriteId.HealthPatch,
  ]);
  assertEquals(spriteIds({ prefab: "decoration", x: 0, y: 0, decoration: "serverPile" }), [
    SpriteId.DecorServerPile,
  ]);
  assertEquals(spriteIds({ prefab: "spearPickup", x: 0, y: 0 }), [SpriteId.Spear]);
  assertEquals(spriteIds({ prefab: "spearTurret", x: 0, y: 0 }), [
    SpriteId.SpearTurret,
    SpriteId.SpearTurretLoaded,
  ]);
  assertEquals(spriteIds({ prefab: "door", x: 0, y: 0, slide: "east" }), []);
  assertEquals(spriteIds({ prefab: "light", x: 0, y: 0, color: "#ffffff", radius: 3 }), []);
  assertEquals(
    spriteIds({ prefab: "sound", x: 0, y: 0, soundId: "ambientHum", radius: 3 }),
    [],
  );
});

Deno.test("criticalSpriteIdsForMap always includes corpse", () => {
  const ids = criticalSpriteIdsForMap(SHIPPED_GAME.levels.start.map, SIMULATION_CONTENT, CONTENT);
  assertEquals(ids.has(SpriteId.Corpse), true);
});

Deno.test("criticalSpriteIdsForMap covers every campaign map entity sprite", () => {
  for (const { map } of SHIPPED_GAME.levels.all) {
    const ids = criticalSpriteIdsForMap(map, SIMULATION_CONTENT, CONTENT);
    for (const entity of map.entities) {
      for (const spriteId of spriteIds(entity)) {
        assertEquals(
          ids.has(spriteId),
          true,
          `${map.name}: missing sprite ${spriteId} for ${entity.prefab}`,
        );
      }
    }
  }
});

Deno.test("mapNeedsDialogueAssets matches NPC presence", () => {
  assertEquals(mapNeedsDialogueAssets(SHIPPED_GAME.levels.get("Boot Sector").map), true);
  assertEquals(mapNeedsDialogueAssets(SHIPPED_GAME.levels.get("Data Conduit").map), false);
});

Deno.test("mapNeedsSpearRevealAsset matches spear pickup presence", () => {
  assertEquals(mapNeedsSpearRevealAsset(SHIPPED_GAME.levels.get("The Nexus").map), true);
  assertEquals(mapNeedsSpearRevealAsset(SHIPPED_GAME.levels.get("Data Conduit").map), false);
});

async function withImmediateIdleCallback(run: () => Promise<void>): Promise<void> {
  const hadOwnIdleCallback = Object.hasOwn(globalThis, "requestIdleCallback");
  const ownIdleCallback = Object.getOwnPropertyDescriptor(globalThis, "requestIdleCallback");
  Object.defineProperty(globalThis, "requestIdleCallback", {
    configurable: true,
    writable: true,
    value: (callback: () => void): number => {
      callback();
      return 1;
    },
  });
  try {
    await run();
  } finally {
    if (hadOwnIdleCallback && ownIdleCallback !== undefined) {
      Object.defineProperty(globalThis, "requestIdleCallback", ownIdleCallback);
    } else {
      delete (globalThis as { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback;
    }
  }
}

async function flushWarmWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

class LoadingDocument {
  readonly sources: string[] = [];

  createElement(tagName: string): LoadingImage {
    if (tagName !== "img") throw new Error(`Unexpected element ${tagName}.`);
    return new LoadingImage(this.sources);
  }
}

class LoadingImage {
  decoding: "async" | "auto" | "sync" = "auto";
  private readonly sources: string[];
  private readonly loadListeners: EventListener[] = [];
  private source = "";

  constructor(sources: string[]) {
    this.sources = sources;
  }

  get src(): string {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    this.sources.push(value);
    queueMicrotask(() => {
      const event = new Event("load");
      for (const listener of this.loadListeners) listener(event);
    });
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type !== "load" || typeof listener !== "function") return;
    this.loadListeners.push(listener);
  }
}

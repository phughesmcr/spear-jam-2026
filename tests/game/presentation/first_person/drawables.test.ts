import { KeyColor } from "@/src/game/content/map_entities.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { SPRITE_ATTACK_MS, SPRITE_DEATH_MS, SPRITE_WALK_MS } from "@/src/game/simulation/components.ts";
import { type DrawableEntity, DrawableKind, SpriteAnimationKind } from "@/src/game/model/render_snapshot.ts";
import { createFirstPersonAssets, type FirstPersonMaterials } from "@/src/game/presentation/first_person/assets/mod.ts";
import { addDrawable, type FirstPersonDrawableState } from "@/src/game/presentation/first_person/drawables.ts";
import { Direction } from "@/src/game/world/direction.ts";
import { createGameMap, type GameMap } from "@/src/game/world/map.ts";
import { clearSceneDynamic, createScene, type RaycastScene } from "@/src/engine/raycast/mod.ts";
import { assertAlmostEquals, assertEquals, assertNotEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

const DOOR_ENTITY = 1 as Entity;
const ACTOR_ENTITY = 2 as Entity;
const SPRITE_ENTITY = 3 as Entity;

function createDrawableState(): FirstPersonDrawableState {
  return {
    spriteTweens: new Map(),
    spritePoint: { x: 0, y: 0, settled: true },
    doorTweens: new Map(),
    doorSample: { value: 0, settled: true },
  };
}

function createDoorMap(): GameMap {
  return createGameMap(
    "Drawable Test",
    [
      [2, 2, 2, 2, 2],
      [2, 1, 1, 1, 2],
      [2, 2, 2, 2, 2],
    ],
    [],
    {
      palette: [
        { kind: "floor", id: 1, floor_texture: "floor", ceiling_texture: "ceiling" },
        { kind: "wall", id: 2, wall_texture: "wall" },
      ],
    },
  );
}

function createTestScene(): RaycastScene {
  return createScene(5, 3);
}

function door(overrides: Partial<Extract<DrawableEntity, { kind: typeof DrawableKind.Door }>> = {}): DrawableEntity {
  return {
    kind: DrawableKind.Door,
    entity: DOOR_ENTITY,
    x: 2,
    y: 1,
    open: false,
    locked: false,
    secret: false,
    glass: false,
    openMs: 100,
    ...overrides,
  };
}

Deno.test("drawables add ordinary and glass doors with semantic materials", () => {
  const materials = createFirstPersonAssets().materials;
  const state = createDrawableState();
  const map = createDoorMap();
  const scene = createTestScene();
  const cell = 1 * scene.mapWidth + 2;

  const ordinaryDemand = addDrawable(
    state,
    materials,
    scene,
    map,
    door({ open: true, locked: true, color: KeyColor.Red }),
    Direction.North,
    0,
  );
  const ordinaryIndex = scene.thinByCell[cell]!;
  assertNotEquals(ordinaryIndex, -1);
  assertEquals(scene.thinTex[ordinaryIndex], materials.door(true, KeyColor.Red));
  assertEquals(scene.thinOffset[ordinaryIndex], 1);
  assertEquals(ordinaryDemand, { interactive: false, ambient: false });

  clearSceneDynamic(scene);
  const glassDemand = addDrawable(
    state,
    materials,
    scene,
    map,
    door({ entity: 4 as Entity, open: true, glass: true }),
    Direction.North,
    0,
  );
  const glassIndex = scene.thinByCell[cell]!;
  assertNotEquals(glassIndex, -1);
  assertEquals(scene.thinTex[glassIndex], materials.glassDoor(true));
  assertEquals(scene.thinOffset[glassIndex], 0);
  assertEquals(glassDemand, { interactive: false, ambient: false });
});

Deno.test("drawables keep secret doors on the sliding-solid path", () => {
  const materials = createFirstPersonAssets().materials;
  const map = createDoorMap();
  const scene = createTestScene();
  const cell = 1 * scene.mapWidth + 2;

  addDrawable(
    createDrawableState(),
    materials,
    scene,
    map,
    door({ secret: true }),
    Direction.North,
    0,
  );
  const closedIndex = scene.slidingSolidByCell[cell]!;
  assertNotEquals(closedIndex, -1);
  assertEquals(scene.slidingSolidTex[closedIndex], materials.wall("wall"));
  assertEquals(scene.slidingSolidOffset[closedIndex], 0);
  assertEquals(scene.thinByCell[cell], -1);

  clearSceneDynamic(scene);
  addDrawable(
    createDrawableState(),
    materials,
    scene,
    map,
    door({ open: true, secret: true }),
    Direction.North,
    0,
  );
  const openIndex = scene.slidingSolidByCell[cell]!;
  assertNotEquals(openIndex, -1);
  assertEquals(scene.slidingSolidOffset[openIndex], 1);
  assertEquals(scene.thinByCell[cell], -1);
});

Deno.test("drawables animate a door from its current openness", () => {
  const materials = createFirstPersonAssets().materials;
  const state = createDrawableState();
  const map = createDoorMap();
  const scene = createTestScene();
  const cell = 1 * scene.mapWidth + 2;

  addDrawable(state, materials, scene, map, door(), Direction.North, 0);
  clearSceneDynamic(scene);
  const started = addDrawable(state, materials, scene, map, door({ open: true }), Direction.North, 100);
  assertEquals(scene.thinOffset[scene.thinByCell[cell]!], 0);
  assertEquals(started.interactive, true);

  clearSceneDynamic(scene);
  const halfway = addDrawable(state, materials, scene, map, door({ open: true }), Direction.North, 150);
  assertAlmostEquals(scene.thinOffset[scene.thinByCell[cell]!], 0.5, 1e-6);
  assertEquals(halfway.interactive, true);

  clearSceneDynamic(scene);
  const finished = addDrawable(state, materials, scene, map, door({ open: true }), Direction.North, 200);
  assertEquals(scene.thinOffset[scene.thinByCell[cell]!], 1);
  assertEquals(finished.interactive, false);
});

Deno.test("drawables choose directional attack sprites and pass actor health", () => {
  const materials = createFirstPersonAssets().materials;
  const scene = createTestScene();
  const nowMs = 100;
  const actor: DrawableEntity = {
    kind: DrawableKind.Actor,
    entity: ACTOR_ENTITY,
    x: 1,
    y: 1,
    dir: Direction.East,
    spriteId: SpriteId.DigitalDog,
    animation: { kind: SpriteAnimationKind.Attack, startedAtMs: nowMs, durationMs: SPRITE_ATTACK_MS },
    health: { current: 4, max: 10 },
  };

  const demand = addDrawable(
    createDrawableState(),
    materials,
    scene,
    createDoorMap(),
    actor,
    Direction.North,
    nowMs,
  );
  const expected = materials.directionalSprite(SpriteId.DigitalDog, "attack", "right");

  assertEquals(scene.spriteCount, 1);
  assertEquals(scene.spriteTex[0], expected?.slot);
  assertEquals(scene.spriteHealthCurrent[0], 4);
  assertEquals(scene.spriteHealthMax[0], 10);
  assertEquals(demand.interactive, true);
});

Deno.test("drawables tween moving actors and select the walk frame", () => {
  const materials = createFirstPersonAssets().materials;
  const state = createDrawableState();
  const scene = createTestScene();
  const map = createDoorMap();
  const initial: DrawableEntity = {
    kind: DrawableKind.Actor,
    entity: ACTOR_ENTITY,
    x: 1,
    y: 1,
    dir: Direction.South,
    spriteId: SpriteId.DigitalDog,
  };
  const moving: DrawableEntity = {
    ...initial,
    x: 2,
    animation: { kind: SpriteAnimationKind.Walk, startedAtMs: 100, durationMs: SPRITE_WALK_MS },
  };

  addDrawable(state, materials, scene, map, initial, Direction.North, 0);
  clearSceneDynamic(scene);
  addDrawable(state, materials, scene, map, moving, Direction.North, 100);
  clearSceneDynamic(scene);
  const demand = addDrawable(state, materials, scene, map, moving, Direction.North, 100 + SPRITE_WALK_MS / 2);

  assertAlmostEquals(scene.spriteX[0]!, 2, 1e-6);
  assertAlmostEquals(scene.spriteY[0]!, 1.5, 1e-6);
  assertEquals(scene.spriteTex[0], materials.directionalSprite(SpriteId.DigitalDog, "walk", "front")?.slot);
  assertEquals(demand.interactive, true);
});

Deno.test("drawables select death sheet frames", () => {
  const materials = createFirstPersonAssets().materials;
  const scene = createTestScene();
  const nowMs = SPRITE_DEATH_MS / 2;
  const corpse: DrawableEntity = {
    kind: DrawableKind.Sprite,
    entity: SPRITE_ENTITY,
    x: 1,
    y: 1,
    spriteId: SpriteId.DigitalDog,
    animation: { kind: SpriteAnimationKind.Death, startedAtMs: 0, durationMs: SPRITE_DEATH_MS },
  };

  const demand = addDrawable(
    createDrawableState(),
    materials,
    scene,
    createDoorMap(),
    corpse,
    Direction.North,
    nowMs,
  );

  assertEquals(scene.spriteTex[0], materials.deathSprite(SpriteId.DigitalDog, 2)?.slot);
  assertEquals(demand.interactive, true);
});

Deno.test("drawables apply item bob, elevation, scale, and ceiling clipping metadata", () => {
  const materials = createFirstPersonAssets().materials;
  const state = createDrawableState();
  const map = createDoorMap();
  const scene = createTestScene();
  const healthPatch: DrawableEntity = {
    kind: DrawableKind.Sprite,
    entity: SPRITE_ENTITY,
    x: 1,
    y: 1,
    spriteId: SpriteId.HealthPatch,
  };

  const demand = addDrawable(state, materials, scene, map, healthPatch, Direction.North, 300);
  assertAlmostEquals(scene.spriteElevation[0]!, 0.055, 1e-6);
  assertEquals(scene.spriteHeight[0], materials.sprite(SpriteId.HealthPatch)?.scale);
  assertEquals(demand, { interactive: false, ambient: true });

  clearSceneDynamic(scene);
  addStaticSprite(materials, state, scene, map, SpriteId.DecorCeilingLight);
  assertAlmostEquals(scene.spriteElevation[0]!, 0.5, 1e-6);
  assertAlmostEquals(scene.spriteHeight[0]!, 0.5, 1e-6);

  clearSceneDynamic(scene);
  addStaticSprite(materials, state, scene, map, SpriteId.MainframeCore);
  assertAlmostEquals(scene.spriteHeight[0]!, 5, 1e-6);
  assertAlmostEquals(scene.spriteCeilingClipDistance[0]!, 8, 1e-6);
});

function addStaticSprite(
  materials: FirstPersonMaterials,
  state: FirstPersonDrawableState,
  scene: RaycastScene,
  map: GameMap,
  spriteId: typeof SpriteId.DecorCeilingLight | typeof SpriteId.MainframeCore,
): void {
  addDrawable(
    state,
    materials,
    scene,
    map,
    { kind: DrawableKind.Sprite, entity: SPRITE_ENTITY, x: 1, y: 1, spriteId },
    Direction.North,
    0,
  );
}

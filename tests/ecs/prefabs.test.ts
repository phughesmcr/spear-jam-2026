import { enemyArchetypeAuthoringKey, EnemyArchetypeCode } from "@/src/content/enemies.ts";
import { SpriteId } from "@/src/content/sprite_ids.ts";
import { hasComponent } from "@/src/ecs/components.ts";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  createDecoration,
  createDoor,
  createEnemy,
  createItem,
  createNpc,
  createPlayer,
  createSound,
  createSpearTurret,
  createUplinkTerminal,
} from "@/src/ecs/prefabs.ts";
import { createRuntime } from "@/src/ecs/runtime.ts";
import { ExamineTextId } from "@/src/game/examine_content.ts";
import { DisplayName } from "@/src/game/names.ts";
import { SoundId } from "@/src/game/sound.ts";
import { StoryEventId, StoryTargetId } from "@/src/game/story.ts";
import { Direction } from "@/src/grid/direction.ts";
import { KeyColor } from "@/src/map/map.ts";
import { flatTestMap } from "@/tests/ecs/helpers.ts";
import { assertEquals, assertThrows } from "@std/assert";
import { TerrainBlock } from "turn-based-engine/crawler";

Deno.test("prefabs attach custom components and exact crawler masks", () => {
  const runtime = createRuntime(flatTestMap(8, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East }, 42);
  const enemy = createEnemy(runtime, {
    x: 2,
    y: 1,
    dir: Direction.West,
    archetype: enemyArchetypeAuthoringKey(EnemyArchetypeCode.MeleeDog),
    displayName: DisplayName.DigitalDog,
  });
  const normalDoor = createDoor(runtime, { x: 3, y: 1, locked: true, color: KeyColor.Red });
  const glassDoor = createDoor(runtime, { x: 4, y: 1, glass: true });
  const item = createItem(runtime, { x: 5, y: 1, item: "healthPatch", amount: 3 });
  const terminal = createUplinkTerminal(runtime, { x: 6, y: 1, goto: "Data Conduit" });

  assertEquals(runtime.crawler.entityForStableId(42), player);
  assertEquals(runtime.crawler.entityVisionRadius(player), 6);
  assertEquals(runtime.crawler.entityBlockMask(player), TerrainBlock.Movement);
  assertEquals(runtime.crawler.entityBlockMask(enemy), TerrainBlock.Movement);
  assertEquals(
    runtime.crawler.entityBlockMask(normalDoor),
    TerrainBlock.Movement | TerrainBlock.Sight | TerrainBlock.EffectLine,
  );
  assertEquals(runtime.crawler.entityBlockMask(glassDoor), TerrainBlock.Movement | TerrainBlock.EffectLine);
  assertEquals(runtime.crawler.entityBlockMask(item), 0);
  assertEquals(runtime.crawler.entityBlockMask(terminal), TerrainBlock.Movement);
  assertEquals(hasComponent(runtime.game, enemy, "Enemy"), true);
  assertEquals(hasComponent(runtime.game, item, "Item"), true);
  runtime.crawler.assertInvariants();
});

Deno.test("locked door requires a key color", () => {
  const runtime = createRuntime(flatTestMap());
  assertThrows(() => createDoor(runtime, { x: 1, y: 0, locked: true }), Error, "missing a key color");
});

Deno.test("prefabs retain optional metadata, sound, and nonblocking decoration contracts", () => {
  const runtime = createRuntime(flatTestMap(7, 3));
  const npc = createNpc(runtime, {
    x: 1,
    y: 1,
    dir: Direction.East,
    displayName: DisplayName.John,
    dialogueTreeId: DialogueTreeId.JohnIntro,
    examineTextId: ExamineTextId.BootSectorUplinkTerminal,
    storyId: StoryTargetId.John,
    onTalkEvent: StoryEventId.JohnSpoken,
  });
  const sound = createSound(runtime, { x: 2, y: 1, soundId: SoundId.AmbientHum, radius: 4, volume: 0.5 });
  const decoration = createDecoration(runtime, { x: 3, y: 1, decoration: "serverPile" });

  assertEquals(hasComponent(runtime.game, npc, "DialogueTreeRef"), true);
  assertEquals(hasComponent(runtime.game, npc, "ExamineTextRef"), true);
  assertEquals(hasComponent(runtime.game, npc, "StoryTarget"), true);
  assertEquals(hasComponent(runtime.game, npc, "OnTalkEvent"), true);
  assertEquals(runtime.game.storage.SoundEmitter.get(sound, "radius"), 4);
  assertEquals(runtime.game.storage.SoundEmitter.get(sound, "volume"), 0.5);
  assertEquals(runtime.crawler.entityBlockMask(decoration), 0);
});

Deno.test("final chamber set-piece prefabs use their initial sprites and collision contracts", () => {
  const runtime = createRuntime(flatTestMap(4, 3));
  const mainframe = createDecoration(runtime, { x: 1, y: 1, decoration: "mainframeCore" });
  const turret = createSpearTurret(runtime, { x: 2, y: 1 });

  assertEquals(runtime.game.storage.Sprite.get(mainframe, "id"), SpriteId.MainframeCore);
  assertEquals(runtime.crawler.entityBlockMask(mainframe), 0);
  assertEquals(runtime.game.storage.Sprite.get(turret, "id"), SpriteId.SpearTurret);
  assertEquals(runtime.crawler.entityBlockMask(turret), TerrainBlock.Movement);
  assertEquals(hasComponent(runtime.game, turret, "Interactable"), true);
  assertEquals(hasComponent(runtime.game, turret, "SpearTurret"), true);
});

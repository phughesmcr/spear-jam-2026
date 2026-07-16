import type { EnemyCatalogEntry } from "@/src/game/content/enemies.ts";
import type { EnemyDef, NpcDef, PlayerDef } from "@/src/game/content/map_entities.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { attackOverridesFromContent } from "@/src/game/model/attack.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { type AttackSchema, DrawableLayer, IDLE_AWARENESS } from "@/src/game/simulation/components.ts";
import {
  DEFAULT_PLAYER_EQUIPMENT,
  DEFAULT_PLAYER_HEALTH,
  DEFAULT_PLAYER_INVENTORY,
  DEFAULT_PLAYER_PROGRESS,
} from "@/src/game/simulation/progression.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import { normalizeDirection } from "@/src/game/world/direction.ts";
import { TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

const DEFAULT_PLAYER_HIT_DC = 10;
const PLAYER_VISION_RADIUS = 6;

type GridActorPrefab = { readonly x: number; readonly y: number; readonly dir: number };

export type PlayerPrefab = Omit<PlayerDef, "prefab">;
type NpcPrefab = Omit<NpcDef, "prefab">;
type EnemyPrefab = Omit<EnemyDef, "prefab">;

export function createPlayer(runtime: GameRuntime, prefab: PlayerPrefab, stableId?: number): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    facing: normalizeDirection(prefab.dir),
    blockMask: TerrainBlock.Movement,
    visionRadius: PLAYER_VISION_RADIUS,
    stableId,
    components: {
      Player: {},
      TurnTaker: {},
      Drawable: { kind: DrawableKind.Player, layer: DrawableLayer.Player },
      Sprite: { id: SpriteId.Player },
      Health: DEFAULT_PLAYER_HEALTH,
      PlayerInventory: DEFAULT_PLAYER_INVENTORY,
      PlayerEquipment: DEFAULT_PLAYER_EQUIPMENT,
      PlayerProgress: DEFAULT_PLAYER_PROGRESS,
      StoryFlags: { mask: 0 },
      Defense: { hitDc: DEFAULT_PLAYER_HIT_DC },
    },
  });
}

export function createNpc(runtime: GameRuntime, prefab: NpcPrefab): Entity {
  return runtime.crawler.spawnCrawler({
    ...actorSpec(prefab),
    components: {
      Npc: {},
      Interactable: {},
      Drawable: { kind: DrawableKind.Actor, layer: DrawableLayer.Npc },
      Sprite: { id: runtime.content.presentation.spriteForDisplayName(prefab.displayName) },
      DisplayName: { displayName: runtime.content.simulation.displayNameCode(prefab.displayName) },
      ...(prefab.dialogueTreeId === undefined ? {} : {
        DialogueTreeRef: { dialogueTreeId: runtime.content.dialogue.code(prefab.dialogueTreeId) },
      }),
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: runtime.content.simulation.examineTextCode(prefab.examineTextId) },
      }),
      ...(prefab.storyId === undefined ? {} : {
        StoryTarget: { storyId: runtime.content.simulation.storyTargetCode(prefab.storyId) },
      }),
      ...(prefab.onTalkEvent === undefined ? {} : {
        OnTalkEvent: { onTalkEvent: runtime.content.simulation.storyEventCode(prefab.onTalkEvent) },
      }),
    },
  });
}

export function createEnemy(runtime: GameRuntime, prefab: EnemyPrefab): Entity {
  const enemy = prefab.archetype === undefined ?
    runtime.content.simulation.enemyForCode(runtime.content.simulation.defaultEnemy) :
    runtime.content.simulation.enemyForKey(prefab.archetype);
  const archetype = enemy.code;
  const catalog = enemy.definition;
  const health = prefab.health ?? catalog.health;
  const displayName = prefab.displayName ?? catalog.displayName;
  return runtime.crawler.spawnCrawler({
    ...actorSpec(prefab),
    components: {
      Enemy: {},
      TurnTaker: {},
      EnemyAwareness: IDLE_AWARENESS,
      EnemyArchetype: { archetype },
      Health: { current: health, max: health },
      Defense: { hitDc: prefab.hitDc ?? catalog.hitDc },
      Attack: createAttackSpec(prefab, catalog),
      Drawable: { kind: DrawableKind.Actor, layer: DrawableLayer.Enemy },
      Sprite: { id: enemy.sprite },
      DisplayName: { displayName: runtime.content.simulation.displayNameCode(displayName) },
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: runtime.content.simulation.examineTextCode(prefab.examineTextId) },
      }),
    },
  });
}

function createAttackSpec(prefab: EnemyPrefab, catalog: EnemyCatalogEntry): AttackSchema {
  const damage = prefab.damage ?? catalog.damage;
  return {
    ...catalog.attack,
    minDamage: damage,
    maxDamage: damage,
    ...attackOverridesFromContent(prefab.attack),
  };
}

function actorSpec(prefab: GridActorPrefab) {
  return {
    x: prefab.x,
    y: prefab.y,
    facing: normalizeDirection(prefab.dir),
    blockMask: TerrainBlock.Movement,
  } as const;
}

import type { EnemyCatalogEntry } from "@/src/game/content/enemies.ts";
import type { EnemyDef, NpcDef, PlayerDef } from "@/src/game/content/map_entities.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { attackOverridesFromContent } from "@/src/game/model/attack.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import {
  type AttackSchema,
  DrawableLayer,
  type GameComponentMap,
  IDLE_AWARENESS,
} from "@/src/game/simulation/components.ts";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";
import {
  DEFAULT_PLAYER_EQUIPMENT,
  DEFAULT_PLAYER_HEALTH,
  DEFAULT_PLAYER_INVENTORY,
  DEFAULT_PLAYER_PROGRESS,
} from "@/src/game/simulation/player_defaults.ts";
import { normalizeDirection } from "turn-based-engine/crawler";
import { type CrawlerSpawnSpec, TerrainBlock } from "turn-based-engine/crawler";

const DEFAULT_PLAYER_HIT_DC = 10;
const PLAYER_VISION_RADIUS = 6;

type GridActorDef = { readonly x: number; readonly y: number; readonly dir: number };

export function playerSpec(prefab: PlayerDef, stableId: number): CrawlerSpawnSpec<GameComponentMap> {
  return {
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
      Health: { ...DEFAULT_PLAYER_HEALTH },
      PlayerInventory: { ...DEFAULT_PLAYER_INVENTORY },
      PlayerEquipment: { ...DEFAULT_PLAYER_EQUIPMENT },
      PlayerProgress: { ...DEFAULT_PLAYER_PROGRESS },
      StoryFlags: { mask: 0 },
      Defense: { hitDc: DEFAULT_PLAYER_HIT_DC },
    },
  };
}

export function npcSpec(prefab: NpcDef, content: GameSessionContent): CrawlerSpawnSpec<GameComponentMap> {
  return {
    ...actorSpec(prefab),
    components: {
      Npc: {},
      Interactable: {},
      Drawable: { kind: DrawableKind.Actor, layer: DrawableLayer.Npc },
      Sprite: { id: content.presentation.spriteForDisplayName(prefab.displayName) },
      DisplayName: { displayName: content.simulation.displayNameCode(prefab.displayName) },
      ...(prefab.dialogueTreeId === undefined ? {} : {
        DialogueTreeRef: { dialogueTreeId: content.dialogue.code(prefab.dialogueTreeId) },
      }),
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: content.simulation.examineTextCode(prefab.examineTextId) },
      }),
      ...(prefab.storyId === undefined ? {} : {
        StoryTarget: { storyId: content.simulation.storyTargetCode(prefab.storyId) },
      }),
      ...(prefab.onTalkEvent === undefined ? {} : {
        OnTalkEvent: { onTalkEvent: content.simulation.storyEventCode(prefab.onTalkEvent) },
      }),
    },
  };
}

export function enemySpec(prefab: EnemyDef, content: GameSessionContent): CrawlerSpawnSpec<GameComponentMap> {
  const enemy = prefab.archetype === undefined ?
    content.simulation.enemyForCode(content.simulation.defaultEnemy) :
    content.simulation.enemyForKey(prefab.archetype);
  const archetype = enemy.code;
  const catalog = enemy.definition;
  const health = prefab.health ?? catalog.health;
  const displayName = prefab.displayName ?? catalog.displayName;
  return {
    ...actorSpec(prefab),
    components: {
      Enemy: {},
      TurnTaker: {},
      EnemyAwareness: { ...IDLE_AWARENESS },
      EnemyArchetype: { archetype },
      Health: { current: health, max: health },
      Defense: { hitDc: prefab.hitDc ?? catalog.hitDc },
      Attack: attackSpec(prefab, catalog),
      Drawable: { kind: DrawableKind.Actor, layer: DrawableLayer.Enemy },
      Sprite: { id: enemy.sprite },
      DisplayName: { displayName: content.simulation.displayNameCode(displayName) },
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: content.simulation.examineTextCode(prefab.examineTextId) },
      }),
    },
  };
}

function attackSpec(prefab: EnemyDef, catalog: EnemyCatalogEntry): AttackSchema {
  const damage = prefab.damage ?? catalog.damage;
  return {
    ...catalog.attack,
    minDamage: damage,
    maxDamage: damage,
    ...attackOverridesFromContent(prefab.attack),
  };
}

function actorSpec(prefab: GridActorDef) {
  return {
    x: prefab.x,
    y: prefab.y,
    facing: normalizeDirection(prefab.dir),
    blockMask: TerrainBlock.Movement,
  } as const;
}

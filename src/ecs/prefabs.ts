import type { Entity, World } from "@phughesmcr/miski";
import { enemyArchetypeForAuthoringKey } from "@/src/content/enemies.ts";
import {
  Attack,
  type AttackSchema,
  Blocking,
  DecorationKind,
  Defense,
  DialogueTreeRef,
  DisplayNameComponent,
  Door,
  Drawable,
  DrawableLayer,
  Enemy,
  EnemyArchetypeComponent,
  EnemyAwareness,
  ExamineTextRef,
  Facing,
  GridPos,
  Health,
  IDLE_AWARENESS,
  Interactable,
  Item,
  ItemKind,
  LightEmitter,
  Locked,
  MapScoped,
  Npc,
  OnTalkEvent,
  PENDING_SPRITE_ANIMATION_START_MS,
  Player,
  PlayerEquipment,
  PlayerInventory,
  PlayerProgress,
  Secret,
  SoundEmitter,
  Sprite,
  SPRITE_DEATH_MS,
  SpriteAnimation,
  SpriteAnimationKind,
  StoryFlags,
  StoryTarget,
  TerminalDestination,
  TurnTaker,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import { DrawableKind, SpriteId } from "@/src/ecs/drawables.ts";
import {
  spriteIdForDecoration,
  spriteIdForDisplayName,
  spriteIdForEnemyArchetype,
  spriteIdForItem,
} from "@/src/content/sprites.ts";
import {
  DEFAULT_ENEMY_ARCHETYPE,
  type EnemyArchetype as EnemyArchetypeType,
  type EnemyCatalogEntry,
  enemyCatalogEntry,
} from "@/src/ecs/enemy_catalog.ts";
import {
  DEFAULT_PLAYER_EQUIPMENT,
  DEFAULT_PLAYER_HEALTH,
  DEFAULT_PLAYER_INVENTORY,
  DEFAULT_PLAYER_PROGRESS,
} from "@/src/ecs/progression.ts";
import {
  dialogueTreeCode,
  DialogueTreeId,
  type DialogueTreeId as DialogueTreeIdType,
} from "@/src/dialogue/dialogue.ts";
import {
  type AttackDef as GameAttackDef,
  AttackFacingRequirement,
  type AttackFacingRequirement as AttackFacingRequirementType,
  AttackPattern,
  type AttackPattern as AttackPatternType,
  AttackTargetMode,
  type AttackTargetMode as AttackTargetModeType,
  DEFAULT_ATTACK,
} from "@/src/game/attack.ts";
import { examineTextCode, ExamineTextId, type ExamineTextId as ExamineTextIdType } from "@/src/game/examine_content.ts";
import { DisplayName, type DisplayName as DisplayNameType, displayNameCode } from "@/src/game/names.ts";
import { soundIdCode } from "@/src/game/sound.ts";
import { storyEventCode, storyEventIdFor, storyTargetCode, storyTargetIdFor } from "@/src/game/story.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import {
  type DecorationDef,
  type DoorDef,
  doorSlideCode,
  type EnemyDef,
  type EntityDef,
  type ItemDef,
  keyColorCode,
  type KeyDef,
  type LightDef,
  type NpcDef,
  type PlayerDef,
  type SoundDef,
  terminalDestinationCode,
  type UplinkCodeDef,
  type UplinkTerminalDef,
  type WeaponPickupDef,
} from "@/src/map/map.ts";

const DEFAULT_PLAYER_HIT_DC = 10;
const ITEM_KINDS = {
  healthPatch: ItemKind.HealthPatch,
  pistolAmmo: ItemKind.PistolAmmo,
  cannonAmmo: ItemKind.CannonAmmo,
} as const satisfies Readonly<Record<string, ItemKind>>;
const DECORATION_KINDS = {
  serverPile: DecorationKind.ServerPile,
  cyborg: DecorationKind.Cyborg,
  ceilingHook: DecorationKind.CeilingHook,
  ceilingLight: DecorationKind.CeilingLight,
  ceilingWires: DecorationKind.CeilingWires,
} as const satisfies Readonly<Record<string, DecorationKind>>;
const ATTACK_FACING_REQUIREMENTS = {
  required: AttackFacingRequirement.Required,
  none: AttackFacingRequirement.None,
} as const satisfies Readonly<Record<string, AttackFacingRequirementType>>;
const ATTACK_PATTERNS = {
  line: AttackPattern.Line,
  adjacent: AttackPattern.Adjacent,
} as const satisfies Readonly<Record<string, AttackPatternType>>;
const ATTACK_TARGETS = {
  first: AttackTargetMode.First,
  all: AttackTargetMode.All,
} as const satisfies Readonly<Record<string, AttackTargetModeType>>;
type PositionedPrefab = {
  readonly x: number;
  readonly y: number;
};

type FacingPrefab = {
  readonly dir: number;
};

type GridActorPrefab = PositionedPrefab & FacingPrefab;

export type PlayerPrefab = Omit<PlayerDef, "prefab">;

export function createPlayer(world: World, prefab: PlayerPrefab): Entity {
  const entity = createGridActor(world, prefab, DrawableKind.Player, DrawableLayer.Player, SpriteId.Player);
  world.components.addBundle(
    entity,
    [
      [Player],
      [TurnTaker],
      [Health, { current: DEFAULT_PLAYER_HEALTH.max, max: DEFAULT_PLAYER_HEALTH.max }],
      [PlayerInventory, DEFAULT_PLAYER_INVENTORY],
      [PlayerEquipment, DEFAULT_PLAYER_EQUIPMENT],
      [PlayerProgress, DEFAULT_PLAYER_PROGRESS],
      [StoryFlags, { mask: 0 }],
      [Defense, { hitDc: DEFAULT_PLAYER_HIT_DC }],
    ] as const,
  );
  return entity;
}

export type NpcPrefab = Omit<NpcDef, "prefab">;

export function createNpc(world: World, prefab: NpcPrefab): Entity {
  const displayName = displayNameForPrefab(prefab.displayName);
  const entity = createGridActor(
    world,
    prefab,
    DrawableKind.Actor,
    DrawableLayer.Npc,
    spriteIdForDisplayName(displayName),
  );
  world.components.addBundle(
    entity,
    [
      [Npc],
      [Interactable],
    ] as const,
  );
  world.components.addToEntity(DisplayNameComponent, entity, { displayName: displayNameCode(displayName) });
  if (prefab.dialogueTreeId !== undefined) {
    world.components.addToEntity(DialogueTreeRef, entity, {
      dialogueTreeId: dialogueTreeCode(dialogueTreeIdForPrefab(prefab.dialogueTreeId)),
    });
  }
  if (prefab.examineTextId !== undefined) {
    world.components.addToEntity(ExamineTextRef, entity, {
      examineTextId: examineTextCode(examineTextIdForPrefab(prefab.examineTextId)),
    });
  }
  if (prefab.storyId !== undefined) {
    world.components.addToEntity(StoryTarget, entity, {
      storyId: storyTargetCode(storyTargetIdFor(prefab.storyId, "npc storyId")),
    });
  }
  if (prefab.onTalkEvent !== undefined) {
    world.components.addToEntity(OnTalkEvent, entity, {
      onTalkEvent: storyEventCode(storyEventIdFor(prefab.onTalkEvent, "npc onTalkEvent")),
    });
  }
  return entity;
}

export type EnemyPrefab = Omit<EnemyDef, "prefab">;

export function createEnemy(world: World, prefab: EnemyPrefab): Entity {
  const archetype = enemyArchetypeForPrefab(prefab.archetype);
  const catalog = enemyCatalogEntry(archetype);
  const health = prefab.health ?? catalog.health;
  const hitDc = prefab.hitDc ?? catalog.hitDc;
  const displayName = prefab.displayName === undefined ? catalog.displayName : displayNameForPrefab(prefab.displayName);
  const entity = createGridActor(
    world,
    prefab,
    DrawableKind.Actor,
    DrawableLayer.Enemy,
    spriteIdForEnemyArchetype(archetype),
  );
  world.components.addBundle(
    entity,
    [
      [Enemy],
      [TurnTaker],
      [EnemyAwareness, IDLE_AWARENESS],
      [EnemyArchetypeComponent, { archetype }],
      [Health, { current: health, max: health }],
      [Defense, { hitDc }],
      [Attack, createAttackSpec(prefab, catalog)],
    ] as const,
  );
  world.components.addToEntity(DisplayNameComponent, entity, { displayName: displayNameCode(displayName) });
  if (prefab.examineTextId !== undefined) {
    world.components.addToEntity(ExamineTextRef, entity, {
      examineTextId: examineTextCode(examineTextIdForPrefab(prefab.examineTextId)),
    });
  }
  return entity;
}

function createAttackSpec(prefab: EnemyPrefab, catalog: EnemyCatalogEntry): AttackSchema {
  const fixedDamage = prefab.damage ?? catalog.damage;
  return {
    ...DEFAULT_ATTACK,
    ...catalog.attack,
    minDamage: fixedDamage,
    maxDamage: fixedDamage,
    ...attackForPrefab(prefab.attack),
  };
}

export type DoorPrefab = Omit<DoorDef, "prefab">;

export function createDoor(world: World, prefab: DoorPrefab): Entity {
  if (prefab.locked === true && prefab.color === undefined) {
    throw new Error("Locked door prefab is missing a key color");
  }

  const entity = world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.Door, layer: DrawableLayer.Structure }],
      [Door, { open: 0, slide: doorSlideCode(prefab.slide), openMs: prefab.openMs ?? 0 }],
      [Interactable],
    ] as const,
  );
  if (prefab.examineTextId !== undefined) {
    world.components.addToEntity(ExamineTextRef, entity, {
      examineTextId: examineTextCode(examineTextIdForPrefab(prefab.examineTextId)),
    });
  }
  if (prefab.locked === true && prefab.color !== undefined) {
    world.components.addToEntity(Locked, entity, { color: keyColorCode(prefab.color) });
  }
  if (prefab.secret === true) {
    world.components.addToEntity(Secret, entity);
  }
  return entity;
}

export type KeyPrefab = Omit<KeyDef, "prefab">;

export function createKey(world: World, prefab: KeyPrefab): Entity {
  return createPickup(world, prefab, ItemKind.Key, keyColorCode(prefab.color));
}

export type UplinkCodePrefab = Omit<UplinkCodeDef, "prefab">;

export function createUplinkCode(world: World, prefab: UplinkCodePrefab): Entity {
  return createPickup(world, prefab, ItemKind.UplinkCode, 0);
}

export type UplinkTerminalPrefab = Omit<UplinkTerminalDef, "prefab">;

export function createUplinkTerminal(world: World, prefab: UplinkTerminalPrefab): Entity {
  const entity = world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure }],
      [Sprite, { id: SpriteId.UplinkTerminal }],
      [UplinkTerminal],
      [Interactable],
      [Blocking],
    ] as const,
  );
  world.components.addToEntity(TerminalDestination, entity, { destination: terminalDestinationCode(prefab.goto) });
  if (prefab.examineTextId !== undefined) {
    world.components.addToEntity(ExamineTextRef, entity, {
      examineTextId: examineTextCode(examineTextIdForPrefab(prefab.examineTextId)),
    });
  }
  return entity;
}

export type WeaponPickupPrefab = Omit<WeaponPickupDef, "prefab">;

export function createWeaponPickup(world: World, prefab: WeaponPickupPrefab): Entity {
  return createPickup(world, prefab, ItemKind.Weapon, prefab.slot);
}

export type ItemPrefab = Omit<ItemDef, "prefab">;

export function createItem(world: World, prefab: ItemPrefab): Entity {
  return createPickup(world, prefab, itemKindForPrefab(prefab.item), prefab.amount);
}

export type DecorationPrefab = Omit<DecorationDef, "prefab">;

export function createDecoration(world: World, prefab: DecorationPrefab): Entity {
  const decoration = decorationKindForPrefab(prefab.decoration);
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure }],
      [Sprite, { id: spriteIdForDecoration(decoration) }],
    ] as const,
  );
}

export type LightPrefab = Omit<LightDef, "prefab">;

export function createLight(world: World, prefab: LightPrefab): Entity {
  const [red, green, blue] = colorChannels(prefab.color);
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [LightEmitter, {
        red,
        green,
        blue,
        radius: prefab.radius,
        flickerAmount: prefab.flickerAmount ?? 0,
        flickerSpeed: prefab.flickerSpeed ?? 0,
      }],
    ] as const,
  );
}

export type SoundPrefab = Omit<SoundDef, "prefab">;

export function createSound(world: World, prefab: SoundPrefab): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [SoundEmitter, {
        soundId: soundIdCode(prefab.soundId),
        radius: prefab.radius,
        volume: prefab.volume ?? 1,
      }],
    ] as const,
  );
}

function enemyArchetypeForPrefab(archetype: string | undefined): EnemyArchetypeType {
  return archetype === undefined ? DEFAULT_ENEMY_ARCHETYPE : enemyArchetypeForAuthoringKey(archetype);
}

function createPickup(world: World, prefab: PositionedPrefab, item: ItemKind, value: number): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Item }],
      [Sprite, { id: spriteIdForItem(item, value) }],
      [Item, { kind: item, value }],
    ] as const,
  );
}

function createGridActor(
  world: World,
  prefab: GridActorPrefab,
  kind: DrawableKind,
  layer: DrawableLayer,
  sprite: SpriteId,
): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Facing, { dir: normalizeDirection(prefab.dir) }],
      [Drawable, { kind, layer }],
      [Sprite, { id: sprite }],
      [Blocking],
    ] as const,
  );
}

export function createMapEntity(world: World, prefab: EntityDef): Entity {
  const entity = createMapEntityByPrefab(world, prefab);
  if (prefab.prefab !== "player") world.components.addToEntity(MapScoped, entity);
  return entity;
}

function createMapEntityByPrefab(world: World, prefab: EntityDef): Entity {
  switch (prefab.prefab) {
    case "player":
      return createPlayer(world, prefab);
    case "npc":
      return createNpc(world, prefab);
    case "enemy":
      return createEnemy(world, prefab);
    case "door":
      return createDoor(world, prefab);
    case "key":
      return createKey(world, prefab);
    case "uplinkCode":
      return createUplinkCode(world, prefab);
    case "uplinkTerminal":
      return createUplinkTerminal(world, prefab);
    case "weaponPickup":
      return createWeaponPickup(world, prefab);
    case "item":
      return createItem(world, prefab);
    case "decoration":
      return createDecoration(world, prefab);
    case "light":
      return createLight(world, prefab);
    case "sound":
      return createSound(world, prefab);
  }
}

export function createCorpse(world: World, position: PositionedPrefab): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, position],
      [MapScoped],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Item }],
      [Sprite, { id: SpriteId.Corpse }],
    ] as const,
  );
}

export function createDeathEffect(world: World, position: PositionedPrefab, sprite: SpriteId): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, position],
      [MapScoped],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Item }],
      [Sprite, { id: sprite }],
      [SpriteAnimation, {
        kind: SpriteAnimationKind.Death,
        startedAtMs: PENDING_SPRITE_ANIMATION_START_MS,
        durationMs: SPRITE_DEATH_MS,
      }],
    ] as const,
  );
}

function colorChannels(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ] as const;
}

function attackForPrefab(attack: EnemyPrefab["attack"] | undefined): Partial<GameAttackDef> {
  if (attack === undefined) return {};
  const spec: Partial<GameAttackDef> = {};
  addAttackNumber(spec, attack, "minDamage");
  addAttackNumber(spec, attack, "maxDamage");
  addAttackNumber(spec, attack, "range");
  addAttackNumber(spec, attack, "attackBonus");
  addAttackNumber(spec, attack, "critThreshold");
  addAttackNumber(spec, attack, "critMultiplier");
  if (attack.requiresFacing !== undefined) {
    spec.requiresFacing = lookup(ATTACK_FACING_REQUIREMENTS, attack.requiresFacing, "attack facing requirement");
  }
  if (attack.pattern !== undefined) spec.pattern = lookup(ATTACK_PATTERNS, attack.pattern, "attack pattern");
  if (attack.targets !== undefined) spec.targets = lookup(ATTACK_TARGETS, attack.targets, "attack target mode");
  return spec;
}

function addAttackNumber<K extends keyof GameAttackDef>(
  spec: Partial<GameAttackDef>,
  attack: EnemyPrefab["attack"],
  key: K,
): void {
  const value = attack?.[key];
  if (typeof value === "number") spec[key] = value as GameAttackDef[K];
}

function displayNameForPrefab(displayName: string): DisplayNameType {
  return knownString(Object.values(DisplayName), displayName, "display name");
}

function dialogueTreeIdForPrefab(dialogueTreeId: string): DialogueTreeIdType {
  return knownString(Object.values(DialogueTreeId), dialogueTreeId, "dialogue tree");
}

function examineTextIdForPrefab(examineTextId: string): ExamineTextIdType {
  return knownString(Object.values(ExamineTextId), examineTextId, "examine text");
}

function itemKindForPrefab(item: string): ItemKind {
  return lookup(ITEM_KINDS, item, "item kind");
}

function decorationKindForPrefab(decoration: string): DecorationKind {
  return lookup(DECORATION_KINDS, decoration, "decoration kind");
}

function knownString<T extends string>(values: readonly T[], value: string, kind: string): T {
  const mapped = values.find((candidate) => candidate === value || candidate === lowerFirst(value));
  if (mapped === undefined) throw new Error(`Unknown ${kind} "${value}".`);
  return mapped;
}

function lookup<T>(table: Readonly<Record<string, T>>, value: string, kind: string): T {
  const mapped = table[value] ?? table[lowerFirst(value)];
  if (mapped === undefined) throw new Error(`Unknown ${kind} "${value}".`);
  return mapped;
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`;
}

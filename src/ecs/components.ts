import { Component, type ComponentPartitions, type DynamicComponent, type Entity, type World } from "@phughesmcr/miski";
import { enemyArchetypeForCode } from "@/src/ecs/enemy_catalog.ts";
import type { EnemyArchetype } from "@/src/ecs/enemy_catalog.ts";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { DisplayName } from "@/src/game/names.ts";
import { type AttackDef, AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";

export { AttackFacingRequirement, AttackPattern, AttackTargetMode };

export type GridPosSchema = { x: number; y: number };
const GRID_POS_STORAGE = { x: Int16Array, y: Int16Array };
export type GridPosPartitions = ComponentPartitions<typeof GRID_POS_STORAGE>;

/**
 * Grid positions are stored as signed 16-bit integers so accidental
 * out-of-range writes stay visible instead of wrapping to valid tiles.
 * `SpatialIndex` validates map bounds for game movement, while spatial
 * lookups read current ECS position state.
 */
export const GridPos: Component<GridPosSchema, typeof GRID_POS_STORAGE> = new Component<
  GridPosSchema,
  typeof GRID_POS_STORAGE
>({
  name: "gridPos",
  schema: GRID_POS_STORAGE,
});

export type FacingSchema = { dir: CardinalDirection };
const FACING_STORAGE = { dir: Uint8Array };
export type FacingPartitions = ComponentPartitions<typeof FACING_STORAGE>;

/** Cardinal heading: 0=N, 1=E, 2=S, 3=W. */
export const Facing: Component<FacingSchema, typeof FACING_STORAGE> = new Component<
  FacingSchema,
  typeof FACING_STORAGE
>({
  name: "facing",
  schema: FACING_STORAGE,
});

export type DisplayNameSchema = { displayName: DisplayName };
const DISPLAY_NAME_STORAGE = { displayName: Uint8Array };
export const DisplayNameComponent: Component<DisplayNameSchema, typeof DISPLAY_NAME_STORAGE> = new Component<
  DisplayNameSchema,
  typeof DISPLAY_NAME_STORAGE
>({
  name: "displayName",
  schema: DISPLAY_NAME_STORAGE,
});

export const Npc: Component<null> = new Component<null>({ name: "npc" });

export type StoryTargetSchema = { id: number };
const STORY_TARGET_STORAGE = { id: Uint8Array };
export const StoryTarget: Component<StoryTargetSchema, typeof STORY_TARGET_STORAGE> = new Component<
  StoryTargetSchema,
  typeof STORY_TARGET_STORAGE
>({
  name: "storyTarget",
  schema: STORY_TARGET_STORAGE,
});

export type TalkStoryEventSchema = { event: number };
const TALK_STORY_EVENT_STORAGE = { event: Uint8Array };
export const TalkStoryEvent: Component<TalkStoryEventSchema, typeof TALK_STORY_EVENT_STORAGE> = new Component<
  TalkStoryEventSchema,
  typeof TALK_STORY_EVENT_STORAGE
>({
  name: "talkStoryEvent",
  schema: TALK_STORY_EVENT_STORAGE,
});

export type DialogueSchema = { dialogueTreeId: number };
export const Dialogue: Component<DialogueSchema> = new Component<DialogueSchema>({
  name: "dialogue",
  schema: { dialogueTreeId: Uint8Array },
});

export type ExamineSchema = { examineTextId: number };
export const Examine: Component<ExamineSchema> = new Component<ExamineSchema>({
  name: "examine",
  schema: { examineTextId: Uint8Array },
});

export const Player: Component<null> = new Component<null>({ name: "player", maxEntities: 1 });

export type PlayerInventorySchema = {
  keyMask: number;
  hasUplinkCode: number;
  pistolAmmo: number;
  cannonAmmo: number;
};
const PLAYER_INVENTORY_STORAGE = {
  keyMask: Uint8Array,
  hasUplinkCode: Uint8Array,
  pistolAmmo: Uint16Array,
  cannonAmmo: Uint16Array,
};
export const PlayerInventory: Component<PlayerInventorySchema, typeof PLAYER_INVENTORY_STORAGE> = new Component<
  PlayerInventorySchema,
  typeof PLAYER_INVENTORY_STORAGE
>({
  name: "playerInventory",
  schema: PLAYER_INVENTORY_STORAGE,
});

export type PlayerEquipmentSchema = {
  selectedWeapon: number;
  unlockedWeaponMask: number;
};
const PLAYER_EQUIPMENT_STORAGE = {
  selectedWeapon: Uint8Array,
  unlockedWeaponMask: Uint8Array,
};
export const PlayerEquipment: Component<PlayerEquipmentSchema, typeof PLAYER_EQUIPMENT_STORAGE> = new Component<
  PlayerEquipmentSchema,
  typeof PLAYER_EQUIPMENT_STORAGE
>({
  name: "playerEquipment",
  schema: PLAYER_EQUIPMENT_STORAGE,
});

export type PlayerProgressSchema = {
  credits: number;
  score: number;
  xp: number;
  levelCredits: number;
};
const PLAYER_PROGRESS_STORAGE = {
  credits: Uint32Array,
  score: Uint32Array,
  xp: Uint32Array,
  levelCredits: Uint32Array,
};
export const PlayerProgress: Component<PlayerProgressSchema, typeof PLAYER_PROGRESS_STORAGE> = new Component<
  PlayerProgressSchema,
  typeof PLAYER_PROGRESS_STORAGE
>({
  name: "playerProgress",
  schema: PLAYER_PROGRESS_STORAGE,
});

export type PlayerTurnEffectsSchema = {
  invisibility: number;
  overclock: number;
  toughness: number;
  healthRegen: number;
};
const PLAYER_TURN_EFFECTS_STORAGE = {
  invisibility: Uint16Array,
  overclock: Uint16Array,
  toughness: Uint16Array,
  healthRegen: Uint16Array,
};
export const PlayerTurnEffects: Component<PlayerTurnEffectsSchema, typeof PLAYER_TURN_EFFECTS_STORAGE> = new Component<
  PlayerTurnEffectsSchema,
  typeof PLAYER_TURN_EFFECTS_STORAGE
>({
  name: "playerTurnEffects",
  schema: PLAYER_TURN_EFFECTS_STORAGE,
});

export const Blocking: Component<null> = new Component<null>({ name: "blocking" });

export const Interactable: Component<null> = new Component<null>({ name: "interactable" });

export const DrawableKind = {
  Player: 1,
  Actor: 2,
  Door: 3,
  Sprite: 4,
} as const;
export type DrawableKind = (typeof DrawableKind)[keyof typeof DrawableKind];

export const DrawableLayer = {
  Item: 10,
  Structure: 20,
  Npc: 30,
  Enemy: 31,
  Player: 40,
} as const;
export type DrawableLayer = (typeof DrawableLayer)[keyof typeof DrawableLayer];

const DRAWABLE_STORAGE = { kind: Uint8Array, layer: Uint8Array };
export type DrawableSchema = { kind: DrawableKind; layer: DrawableLayer };
export const Drawable: Component<DrawableSchema, typeof DRAWABLE_STORAGE> = new Component<
  DrawableSchema,
  typeof DRAWABLE_STORAGE
>({
  name: "drawable",
  schema: DRAWABLE_STORAGE,
});

export const SpriteId = {
  Player: 1,
  Npc: 2,
  John: 3,
  DigitalDog: 4,
  GigabitGunslinger: 5,
  NetworkNeophyte: 6,
  SystemSentinel: 7,
  AgenticAcolyte: 8,
  UplinkTerminal: 9,
  HealthPatch: 10,
  RedKey: 11,
  BlueKey: 12,
  YellowKey: 13,
  Weapon2: 14,
  Weapon3: 15,
  UplinkCode: 16,
  Corpse: 17,
  PistolAmmo: 18,
  CannonAmmo: 19,
  DecorServerPile: 20,
  DecorCyborg: 21,
  DecorCeilingHook: 22,
  DecorCeilingLight: 23,
  DecorCeilingWires: 24,
} as const;
export type SpriteId = (typeof SpriteId)[keyof typeof SpriteId];

export const DecorationKind = {
  ServerPile: 1,
  Cyborg: 2,
  CeilingHook: 3,
  CeilingLight: 4,
  CeilingWires: 5,
} as const;
export type DecorationKind = (typeof DecorationKind)[keyof typeof DecorationKind];

const SPRITE_STORAGE = { id: Uint8Array };
export type SpriteSchema = { id: SpriteId };
export const Sprite: Component<SpriteSchema, typeof SPRITE_STORAGE> = new Component<
  SpriteSchema,
  typeof SPRITE_STORAGE
>({
  name: "sprite",
  schema: SPRITE_STORAGE,
});

export const SpriteAnimationKind = {
  Walk: 1,
  Attack: 2,
  Death: 3,
} as const;
export type SpriteAnimationKind = (typeof SpriteAnimationKind)[keyof typeof SpriteAnimationKind];

export const SPRITE_WALK_MS = 170;
export const SPRITE_ATTACK_MS = 380;
export const SPRITE_DEATH_MS = 560;
export const PENDING_SPRITE_ANIMATION_START_MS = -1;

export type SpriteAnimationSchema = {
  kind: SpriteAnimationKind;
  startedAtMs: number;
  durationMs: number;
};
const SPRITE_ANIMATION_STORAGE = {
  kind: Uint8Array,
  startedAtMs: Float64Array,
  durationMs: Uint16Array,
};
export const SpriteAnimation: Component<SpriteAnimationSchema, typeof SPRITE_ANIMATION_STORAGE> = new Component<
  SpriteAnimationSchema,
  typeof SPRITE_ANIMATION_STORAGE
>({
  name: "spriteAnimation",
  schema: SPRITE_ANIMATION_STORAGE,
});

export type DoorSchema = {
  open: number;
  /** Door slide direction code from {@link doorSlideCode}; 0 = default. */
  slide: number;
  /** Milliseconds for a full open/close slide; 0 = default. */
  openMs: number;
};
const DOOR_STORAGE = { open: Uint8Array, slide: Uint8Array, openMs: Uint16Array };
export const Door: Component<DoorSchema, typeof DOOR_STORAGE> = new Component<DoorSchema, typeof DOOR_STORAGE>({
  name: "door",
  schema: DOOR_STORAGE,
});

export type LockedSchema = { color: number };
const LOCKED_STORAGE = { color: Uint8Array };
export const Locked: Component<LockedSchema, typeof LOCKED_STORAGE> = new Component<
  LockedSchema,
  typeof LOCKED_STORAGE
>({
  name: "locked",
  schema: LOCKED_STORAGE,
});

/** Marks a door disguised as a wall until the player bumps into it. */
export const Secret: Component<null> = new Component<null>({ name: "secret" });

export type UplinkTerminalSchema = { destination: number };
const UPLINK_TERMINAL_STORAGE = { destination: Uint16Array };
export const UplinkTerminal: Component<UplinkTerminalSchema, typeof UPLINK_TERMINAL_STORAGE> = new Component<
  UplinkTerminalSchema,
  typeof UPLINK_TERMINAL_STORAGE
>({
  name: "uplinkTerminal",
  schema: UPLINK_TERMINAL_STORAGE,
});

export const ItemKind = {
  HealthPatch: 1,
  PistolAmmo: 2,
  CannonAmmo: 3,
  Key: 4,
  UplinkCode: 5,
  Weapon: 6,
} as const;
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];
export const ITEM_KIND_CODES = Object.values(ItemKind);

export type ItemSchema = { kind: ItemKind; value: number };
const ITEM_STORAGE = { kind: Uint8Array, value: Uint8Array };
export const Item: Component<ItemSchema, typeof ITEM_STORAGE> = new Component<ItemSchema, typeof ITEM_STORAGE>({
  name: "item",
  schema: ITEM_STORAGE,
});

export type LightEmitterSchema = {
  red: number;
  green: number;
  blue: number;
  radius: number;
  flickerAmount: number;
  flickerSpeed: number;
};
const LIGHT_EMITTER_STORAGE = {
  red: Uint8Array,
  green: Uint8Array,
  blue: Uint8Array,
  radius: Uint8Array,
  flickerAmount: Float32Array,
  flickerSpeed: Float32Array,
};
export const LightEmitter: Component<LightEmitterSchema, typeof LIGHT_EMITTER_STORAGE> = new Component<
  LightEmitterSchema,
  typeof LIGHT_EMITTER_STORAGE
>({
  name: "lightEmitter",
  schema: LIGHT_EMITTER_STORAGE,
});

export const TurnTaker: Component<null> = new Component<null>({ name: "turnTaker" });

export const Enemy: Component<null> = new Component<null>({ name: "enemy" });

export const AwarenessState = {
  Idle: 0,
  Investigating: 1,
  Alert: 2,
} as const;
export type AwarenessState = (typeof AwarenessState)[keyof typeof AwarenessState];

export type EnemyAwarenessSchema = {
  state: AwarenessState;
  lastKnownX: number;
  lastKnownY: number;
  turnsSinceSeen: number;
};
const UNKNOWN_LAST_KNOWN_POSITION = -1;
export const IDLE_AWARENESS = {
  state: AwarenessState.Idle,
  lastKnownX: UNKNOWN_LAST_KNOWN_POSITION,
  lastKnownY: UNKNOWN_LAST_KNOWN_POSITION,
  turnsSinceSeen: 0,
} as const satisfies EnemyAwarenessSchema;
const ENEMY_AWARENESS_STORAGE = {
  state: Uint8Array,
  lastKnownX: Int16Array,
  lastKnownY: Int16Array,
  turnsSinceSeen: Uint8Array,
};
export type EnemyAwarenessPartitions = ComponentPartitions<typeof ENEMY_AWARENESS_STORAGE>;
export const EnemyAwareness: Component<EnemyAwarenessSchema, typeof ENEMY_AWARENESS_STORAGE> = new Component<
  EnemyAwarenessSchema,
  typeof ENEMY_AWARENESS_STORAGE
>({
  name: "enemyAwareness",
  schema: ENEMY_AWARENESS_STORAGE,
});

export type EnemyArchetypeSchema = { archetype: EnemyArchetype };
const ENEMY_ARCHETYPE_STORAGE = { archetype: Uint8Array };
export const EnemyArchetypeComponent: Component<EnemyArchetypeSchema, typeof ENEMY_ARCHETYPE_STORAGE> = new Component<
  EnemyArchetypeSchema,
  typeof ENEMY_ARCHETYPE_STORAGE
>({
  name: "enemyArchetype",
  schema: ENEMY_ARCHETYPE_STORAGE,
});

export function enemyArchetypeFor(world: World, entity: Entity): EnemyArchetype | undefined {
  const archetype = world.components.readEntityData(EnemyArchetypeComponent, entity)?.archetype;
  return archetype === undefined ? undefined : enemyArchetypeForCode(archetype);
}

export type HealthSchema = { current: number; max: number };
const HEALTH_STORAGE = { current: Uint8Array, max: Uint8Array };
export const Health: Component<HealthSchema, typeof HEALTH_STORAGE> = new Component<
  HealthSchema,
  typeof HEALTH_STORAGE
>({
  name: "health",
  schema: HEALTH_STORAGE,
});

export function healthFor(world: World, entity: Entity): HealthSchema | undefined {
  const health = world.components.readEntityData(Health, entity);
  if (health === undefined) return undefined;

  return {
    current: health.current,
    max: health.max,
  };
}

export type DefenseSchema = { hitDc: number };
const DEFENSE_STORAGE = { hitDc: Uint8Array };
export const Defense: Component<DefenseSchema, typeof DEFENSE_STORAGE> = new Component<
  DefenseSchema,
  typeof DEFENSE_STORAGE
>({
  name: "defense",
  schema: DEFENSE_STORAGE,
});

export type AttackSchema = AttackDef;
const ATTACK_STORAGE = {
  minDamage: Uint8Array,
  maxDamage: Uint8Array,
  range: Uint8Array,
  requiresFacing: Uint8Array,
  attackBonus: Int8Array,
  critThreshold: Uint8Array,
  critMultiplier: Uint8Array,
  pattern: Uint8Array,
  targets: Uint8Array,
};
export const Attack: Component<AttackSchema, typeof ATTACK_STORAGE> = new Component<
  AttackSchema,
  typeof ATTACK_STORAGE
>({
  name: "attack",
  schema: ATTACK_STORAGE,
});

export const ALL_COMPONENTS: DynamicComponent[] = [
  GridPos,
  Facing,
  DisplayNameComponent,
  Npc,
  StoryTarget,
  TalkStoryEvent,
  Dialogue,
  Examine,
  Player,
  PlayerInventory,
  PlayerEquipment,
  PlayerProgress,
  PlayerTurnEffects,
  Blocking,
  Interactable,
  Drawable,
  Sprite,
  SpriteAnimation,
  Door,
  Locked,
  Secret,
  UplinkTerminal,
  Item,
  LightEmitter,
  TurnTaker,
  Enemy,
  EnemyAwareness,
  EnemyArchetypeComponent,
  Health,
  Defense,
  Attack,
];

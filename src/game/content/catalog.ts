import { type MusicTrack, TrackId } from "@/src/game/content/audio/music.ts";
import type { SoundCatalogEntry } from "@/src/game/content/audio/sounds.ts";
import { createCodeRegistry } from "@/src/game/content/code_registry.ts";
import {
  DIALOGUE_TREE_IDS,
  type DialogueChoice,
  type DialogueNode,
  type DialogueTree,
  DialogueTreeId,
  type DialogueTreeStart,
  MAX_DIALOGUE_CHOICES,
} from "@/src/game/content/dialogue/trees.ts";
import { VOICE_IDS, type VoiceId } from "@/src/game/content/dialogue/voices.ts";
import {
  ENEMY_ARCHETYPE_KEYS,
  EnemyArchetypeCode,
  type EnemyArchetypeKey,
  type EnemyCatalogEntry,
} from "@/src/game/content/enemies.ts";
import { EXAMINE_TEXT_IDS, ExamineTextId } from "@/src/game/content/examine_text.ts";
import { ITEM_KIND_CODES, ItemKind, MAP_ITEM_KINDS, type MapItemKind } from "@/src/game/content/items.ts";
import {
  DECORATION_KINDS,
  type DecorationKind,
  KEY_COLORS,
  KeyColor,
  type KeyColor as KeyColorType,
} from "@/src/game/content/map_entities.ts";
import { DISPLAY_NAME_IDS, DisplayName } from "@/src/game/content/names.ts";
import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import {
  STORY_EVENT_IDS,
  STORY_TARGET_IDS,
  type StoryEventDefinition,
  StoryEventId,
  StoryTargetId,
} from "@/src/game/content/story.ts";
import type { TopDownSpriteAppearance } from "@/src/game/content/sprites.ts";
import type { PlayerWeaponSpec } from "@/src/game/content/weapons.ts";
import { type AttackDef, AttackPattern, AttackTargetMode, DEFAULT_ATTACK } from "@/src/game/model/attack.ts";
import type { CommandSlot } from "@/src/game/model/state.ts";
import { SOUND_IDS, SoundId } from "@/src/game/model/sound.ts";
import { compileCampaign } from "@/src/game/world/campaign.ts";
import { type GameMap, mapDimensions } from "@/src/game/world/map.ts";

const COMMAND_SLOTS = [1, 2, 3] as const satisfies readonly CommandSlot[];
const PICKUP_WEAPON_SLOTS = [2, 3] as const;
const TRACK_IDS = Object.values(TrackId);
const SPRITE_IDS = Object.values(SpriteId);
const ATTACK_PATTERNS = Object.values(AttackPattern);
const ATTACK_TARGET_MODES = Object.values(AttackTargetMode);
const ATTACK_FIELD_NAMES = [
  "minDamage",
  "maxDamage",
  "range",
  "attackBonus",
  "critThreshold",
  "critMultiplier",
  "pattern",
  "targets",
] as const satisfies readonly (keyof AttackDef)[];
const TOP_DOWN_SHAPES = [
  "actor",
  "badge",
  "key",
  "none",
  "player",
  "terminal",
  "uplinkCode",
  "weapon",
] as const;
const STABLE_DISPLAY_NAME_CODES: Readonly<Record<DisplayName, number>> = {
  [DisplayName.John]: 1,
  [DisplayName.DigitalDog]: 2,
  [DisplayName.GigabitGunslinger]: 3,
  [DisplayName.NetworkNeophyte]: 4,
  [DisplayName.SystemSentinel]: 5,
  [DisplayName.AgenticAcolyte]: 6,
};
const STABLE_EXAMINE_TEXT_CODES: Readonly<Record<ExamineTextId, number>> = {
  [ExamineTextId.BootSectorUplinkTerminal]: 1,
};
const STABLE_STORY_EVENT_CODES: Readonly<Record<StoryEventId, number>> = {
  [StoryEventId.JohnSpoken]: 1,
};
const STABLE_STORY_TARGET_CODES: Readonly<Record<StoryTargetId, number>> = {
  [StoryTargetId.John]: 1,
};
const STABLE_DIALOGUE_CODES: Readonly<Record<DialogueTreeId, number>> = {
  [DialogueTreeId.JohnIntro]: 1,
  [DialogueTreeId.JohnThanks]: 2,
  [DialogueTreeId.JohnNexus]: 3,
  [DialogueTreeId.SpearPower]: 4,
  [DialogueTreeId.JohnCore]: 5,
};
const STABLE_KEY_COLOR_CODES: Readonly<Record<KeyColorType, number>> = {
  [KeyColor.Red]: 1,
  [KeyColor.Blue]: 2,
  [KeyColor.Yellow]: 3,
};
const STABLE_SOUND_CODES: Readonly<Record<SoundId, number>> = {
  [SoundId.BlockedMove]: 1,
  [SoundId.DoorOpen]: 2,
  [SoundId.DoorLocked]: 3,
  [SoundId.PickupItem]: 4,
  [SoundId.PickupKey]: 5,
  [SoundId.PickupWeapon]: 6,
  [SoundId.PickupHealth]: 7,
  [SoundId.PickupAmmo]: 8,
  [SoundId.PickupUplinkCode]: 9,
  [SoundId.WeaponBitShifter]: 10,
  [SoundId.WeaponPulsePistol]: 11,
  [SoundId.WeaponCurrentCannon]: 12,
  [SoundId.WeaponNoAmmo]: 13,
  [SoundId.PlayerHurt]: 14,
  [SoundId.NpcInteract]: 15,
  [SoundId.TerminalLocked]: 16,
  [SoundId.TerminalUse]: 17,
  [SoundId.AmbientHum]: 18,
  [SoundId.AmbientLightBuzz]: 19,
  [SoundId.EnemyInvestigate]: 20,
  [SoundId.DogIdle]: 21,
  [SoundId.DogAlert]: 22,
  [SoundId.DogAttack]: 23,
  [SoundId.DogHurt]: 24,
  [SoundId.DogDefeat]: 25,
  [SoundId.GunslingerIdle]: 26,
  [SoundId.GunslingerAlert]: 27,
  [SoundId.GunslingerAttack]: 28,
  [SoundId.GunslingerHurt]: 29,
  [SoundId.GunslingerDefeat]: 30,
  [SoundId.NeophyteIdle]: 31,
  [SoundId.NeophyteAlert]: 32,
  [SoundId.NeophyteAttack]: 33,
  [SoundId.NeophyteHurt]: 34,
  [SoundId.NeophyteDefeat]: 35,
  [SoundId.SentinelIdle]: 36,
  [SoundId.SentinelAlert]: 37,
  [SoundId.SentinelAttack]: 38,
  [SoundId.SentinelHurt]: 39,
  [SoundId.SentinelDefeat]: 40,
  [SoundId.AcolyteIdle]: 41,
  [SoundId.AcolyteAlert]: 42,
  [SoundId.AcolyteAttack]: 43,
  [SoundId.AcolyteHurt]: 44,
  [SoundId.AcolyteDefeat]: 45,
  [SoundId.GlassSmash]: 46,
  [SoundId.AmbientWind]: 47,
};
const FIXED_ITEM_KINDS = [
  ItemKind.HealthPatch,
  ItemKind.PistolAmmo,
  ItemKind.CannonAmmo,
  ItemKind.UplinkCode,
  ItemKind.Spear,
] as const;
const EXPECTED_MAP_ITEM_KINDS: Readonly<Record<MapItemKind, ItemKind>> = {
  healthPatch: ItemKind.HealthPatch,
  pistolAmmo: ItemKind.PistolAmmo,
  cannonAmmo: ItemKind.CannonAmmo,
};

type FixedItemKind = (typeof FIXED_ITEM_KINDS)[number];
type PickupWeaponSlot = (typeof PICKUP_WEAPON_SLOTS)[number];
type AuthoredEnemy = Omit<EnemyCatalogEntry, "attack"> & {
  readonly attack: Readonly<Partial<AttackDef>>;
};

export type CompiledLevel = {
  readonly map: GameMap;
  readonly music: TrackId;
};

export type LevelDestination =
  | { readonly kind: "victory" }
  | { readonly kind: "level"; readonly level: CompiledLevel };

export interface LevelCatalog {
  readonly start: CompiledLevel;
  readonly all: readonly CompiledLevel[];
  get(name: string): CompiledLevel;
  codeForDestination(destination: string): number;
  destinationForCode(code: number): LevelDestination;
}

export interface CompiledEnemy {
  readonly code: EnemyArchetypeCode;
  readonly sprite: SpriteIdType;
  readonly definition: EnemyCatalogEntry;
}

export interface SimulationContent {
  readonly defaultEnemy: EnemyArchetypeCode;
  enemyForKey(key: EnemyArchetypeKey): CompiledEnemy;
  enemyForCode(code: number): CompiledEnemy;
  itemKindForKey(key: MapItemKind): ItemKind;
  itemKindForCode(code: number): ItemKind;
  displayNameCode(id: DisplayName): number;
  displayNameForCode(code: number): { readonly id: DisplayName; readonly text: string };
  examineTextCode(id: ExamineTextId): number;
  examineTextForCode(code: number): string;
  storyEventCode(id: StoryEventId): number;
  storyEventForCode(code: number): StoryEventId;
  storyTargetCode(id: StoryTargetId): number;
  storyTargetForCode(code: number): StoryTargetId;
  storyEvent(id: StoryEventId): StoryEventDefinition;
  weapon(slot: CommandSlot): PlayerWeaponSpec;
}

export interface DialogueContent {
  start(id: DialogueTreeId): DialogueTreeStart;
  node(treeKey: string, nodeId: string): DialogueNode;
  code(id: DialogueTreeId): number;
  idForCode(code: number): DialogueTreeId;
}

export interface AudioContent {
  track(id: TrackId): MusicTrack;
  sound(id: SoundId): SoundCatalogEntry;
  soundCode(id: SoundId): number;
  soundIdForCode(code: number): SoundId;
  voiceSource(id: VoiceId): string;
}

export interface PresentationContent {
  appearance(id: SpriteIdType): TopDownSpriteAppearance;
  spriteForDisplayName(id: DisplayName): SpriteIdType;
  spriteForItem(kind: ItemKind, value: number): SpriteIdType;
  spriteForDecoration(kind: DecorationKind): SpriteIdType;
}

export interface GameCatalog {
  readonly levels: LevelCatalog;
  readonly simulation: SimulationContent;
  readonly dialogue: DialogueContent;
  readonly audio: AudioContent;
  readonly presentation: PresentationContent;
}

export type GameCatalogSource = {
  readonly campaign: unknown;
  readonly musicByMap: Readonly<Record<string, TrackId>>;
  readonly simulation: {
    readonly defaultEnemy: EnemyArchetypeKey;
    readonly enemies: Readonly<Record<EnemyArchetypeKey, AuthoredEnemy>>;
    readonly itemKinds: Readonly<Record<MapItemKind, ItemKind>>;
    readonly displayNames: Readonly<Record<DisplayName, string>>;
    readonly examineTexts: Readonly<Record<ExamineTextId, string>>;
    readonly storyEvents: Readonly<Record<StoryEventId, StoryEventDefinition>>;
    readonly storyTargets: readonly StoryTargetId[];
    readonly weapons: Readonly<Record<CommandSlot, PlayerWeaponSpec>>;
  };
  readonly dialogue: {
    readonly ids: readonly DialogueTreeId[];
    readonly keys: Readonly<Record<DialogueTreeId, string>>;
    readonly trees: unknown;
  };
  readonly audio: {
    readonly tracks: Readonly<Record<TrackId, MusicTrack>>;
    readonly sounds: Readonly<Record<SoundId, SoundCatalogEntry>>;
    readonly voices: Readonly<Record<VoiceId, string>>;
  };
  readonly presentation: {
    readonly appearances: Readonly<Record<SpriteIdType, TopDownSpriteAppearance>>;
    readonly displayNameSprites: Readonly<Record<DisplayName, SpriteIdType>>;
    readonly enemySprites: Readonly<Record<EnemyArchetypeKey, SpriteIdType>>;
    readonly itemSprites: Readonly<Record<FixedItemKind, SpriteIdType>>;
    readonly keySprites: Readonly<Record<KeyColorType, SpriteIdType>>;
    readonly weaponSprites: Readonly<Record<PickupWeaponSlot, SpriteIdType>>;
    readonly decorationSprites: Readonly<Record<DecorationKind, SpriteIdType>>;
  };
};

export function compileGameCatalog(source: unknown): GameCatalog {
  const input = cloneCatalogSource(source);
  const audio = compileAudio(input.audio);
  const presentation = compilePresentation(input.presentation);
  const simulation = compileSimulation(input.simulation, input.presentation.enemySprites);
  const dialogue = compileDialogue(input.dialogue, audio);
  const levels = compileLevels(input.campaign, input.musicByMap);

  validateCatalog({ levels, simulation, dialogue, audio, presentation });
  return Object.freeze({ levels, simulation, dialogue, audio, presentation });
}

function compileLevels(campaignSource: unknown, musicByMap: Readonly<Record<string, TrackId>>): LevelCatalog {
  const campaign = compileCampaign(campaignSource);
  const mapNames = new Set(campaign.maps.map((map) => map.name));
  assertExactKeys("level music", musicByMap, mapNames);

  const all = Object.freeze(campaign.maps.map((map) =>
    Object.freeze({
      map: deepFreeze(map),
      music: requiredEntry(musicByMap, map.name, "level music"),
    })
  ));
  const levelsByName = new Map(all.map((level) => [level.map.name, level]));
  return Object.freeze({
    start: requiredMapEntry(levelsByName, campaign.startMap.name, "level"),
    all,
    get(name: string): CompiledLevel {
      return requiredMapEntry(levelsByName, name, "level");
    },
    codeForDestination(destination: string): number {
      return campaign.codeForDestination(destination);
    },
    destinationForCode(code: number): LevelDestination {
      const destination = campaign.destinationForCode(code);
      if (destination.kind === "victory") return destination;
      return { kind: "level", level: requiredMapEntry(levelsByName, destination.map.name, "level") };
    },
  });
}

function compileSimulation(
  source: GameCatalogSource["simulation"],
  enemySprites: GameCatalogSource["presentation"]["enemySprites"],
): SimulationContent {
  assertExactKeys("simulation source", source, [
    "defaultEnemy",
    "enemies",
    "itemKinds",
    "displayNames",
    "examineTexts",
    "storyEvents",
    "storyTargets",
    "weapons",
  ]);
  assertStableVocabulary("display names", DISPLAY_NAME_IDS, STABLE_DISPLAY_NAME_CODES);
  assertStableVocabulary("examine texts", EXAMINE_TEXT_IDS, STABLE_EXAMINE_TEXT_CODES);
  assertStableVocabulary("story events", STORY_EVENT_IDS, STABLE_STORY_EVENT_CODES);
  assertStableVocabulary("story targets", STORY_TARGET_IDS, STABLE_STORY_TARGET_CODES);
  if (STORY_EVENT_IDS.length > 32) throw new Error("Story events do not fit Uint32 flag storage.");
  assertExactKeys("enemy definitions", source.enemies, ENEMY_ARCHETYPE_KEYS);
  assertExactKeys("map item kinds", source.itemKinds, MAP_ITEM_KINDS);
  assertExactKeys("display names", source.displayNames, DISPLAY_NAME_IDS);
  assertExactKeys("examine texts", source.examineTexts, EXAMINE_TEXT_IDS);
  assertExactKeys("story events", source.storyEvents, STORY_EVENT_IDS);
  assertExactKeys("weapons", source.weapons, COMMAND_SLOTS);
  assertExactKeys("enemy sprites", enemySprites, ENEMY_ARCHETYPE_KEYS);
  assertOrderedIds("story targets", source.storyTargets, STORY_TARGET_IDS);

  const enemyRegistry = createCodeRegistry("enemy archetype", ENEMY_ARCHETYPE_KEYS);
  const enemyCodes = Object.values(EnemyArchetypeCode);
  const enemiesByKey = new Map<EnemyArchetypeKey, CompiledEnemy>();
  for (const [index, key] of ENEMY_ARCHETYPE_KEYS.entries()) {
    const authored: unknown = requiredEntry(source.enemies, key, "enemy definitions");
    validateAuthoredEnemy(authored, key);
    const code = enemyRegistry.encode(key) as EnemyArchetypeCode;
    if (code !== enemyCodes[index]) throw new Error(`Enemy code for "${key}" is no longer stable.`);
    const sprite = requiredEntry(enemySprites, key, "enemy sprite");
    const definition = { ...authored, attack: { ...DEFAULT_ATTACK, ...authored.attack } };
    enemiesByKey.set(key, deepFreeze({ code, sprite, definition }));
  }
  const defaultEnemyKey = enemyRegistry.assert(source.defaultEnemy, "default enemy");

  for (const key of MAP_ITEM_KINDS) {
    const actual = requiredEntry(source.itemKinds, key, "map item kinds");
    if (actual !== EXPECTED_MAP_ITEM_KINDS[key]) {
      throw new Error(`Map item "${key}" must compile to stable item kind ${EXPECTED_MAP_ITEM_KINDS[key]}.`);
    }
  }

  const displayNameRegistry = createCodeRegistry("display name", DISPLAY_NAME_IDS);
  const displayNamesByCode = new Map(DISPLAY_NAME_IDS.map((id) => [
    displayNameRegistry.encode(id),
    deepFreeze({ id, text: requiredNonEmptyString(source.displayNames, id, "display names") }),
  ]));
  const examineTextRegistry = createCodeRegistry("examine text", EXAMINE_TEXT_IDS);
  const storyEventRegistry = createCodeRegistry("story event", STORY_EVENT_IDS);
  const storyTargetRegistry = createCodeRegistry("story target", STORY_TARGET_IDS);
  for (const id of STORY_EVENT_IDS) {
    validateStoryEvent(requiredEntry(source.storyEvents, id, "story event"), id, storyTargetRegistry.ids);
  }
  for (const slot of COMMAND_SLOTS) validateWeapon(requiredEntry(source.weapons, slot, "weapon"), slot);
  assertUint8Registry("enemy archetypes", ENEMY_ARCHETYPE_KEYS);
  assertUint8Registry("display names", DISPLAY_NAME_IDS);
  assertUint8Registry("examine texts", EXAMINE_TEXT_IDS);
  assertUint8Registry("story events", STORY_EVENT_IDS);
  assertUint8Registry("story targets", STORY_TARGET_IDS);

  return Object.freeze({
    defaultEnemy: enemyRegistry.encode(defaultEnemyKey) as EnemyArchetypeCode,
    enemyForKey(key: EnemyArchetypeKey): CompiledEnemy {
      return requiredMapEntry(enemiesByKey, enemyRegistry.assert(key, "enemy lookup"), "enemy");
    },
    enemyForCode(code: number): CompiledEnemy {
      return requiredMapEntry(enemiesByKey, enemyRegistry.decode(code), "enemy");
    },
    itemKindForKey(key: MapItemKind): ItemKind {
      return requiredEntry(source.itemKinds, key, "map item kind");
    },
    itemKindForCode(code: number): ItemKind {
      if (!ITEM_KIND_CODES.includes(code as ItemKind)) throw new Error(`Unknown item kind code: ${code}`);
      return code as ItemKind;
    },
    displayNameCode(id: DisplayName): number {
      return displayNameRegistry.encode(id);
    },
    displayNameForCode(code: number): { readonly id: DisplayName; readonly text: string } {
      return requiredMapEntry(displayNamesByCode, code, "display name");
    },
    examineTextCode(id: ExamineTextId): number {
      return examineTextRegistry.encode(id);
    },
    examineTextForCode(code: number): string {
      const id = examineTextRegistry.decode(code);
      return requiredNonEmptyString(source.examineTexts, id, "examine texts");
    },
    storyEventCode(id: StoryEventId): number {
      return storyEventRegistry.encode(id);
    },
    storyEventForCode(code: number): StoryEventId {
      return storyEventRegistry.decode(code);
    },
    storyTargetCode(id: StoryTargetId): number {
      return storyTargetRegistry.encode(id);
    },
    storyTargetForCode(code: number): StoryTargetId {
      return storyTargetRegistry.decode(code);
    },
    storyEvent(id: StoryEventId): StoryEventDefinition {
      storyEventRegistry.encode(id);
      return requiredEntry(source.storyEvents, id, "story event");
    },
    weapon(slot: CommandSlot): PlayerWeaponSpec {
      return requiredEntry(source.weapons, slot, "weapon");
    },
  });
}

function compileDialogue(source: GameCatalogSource["dialogue"], audio: AudioContent): DialogueContent {
  assertExactKeys("dialogue source", source, ["ids", "keys", "trees"]);
  assertStableVocabulary("dialogue trees", DIALOGUE_TREE_IDS, STABLE_DIALOGUE_CODES);
  assertOrderedIds("dialogue tree ids", source.ids, DIALOGUE_TREE_IDS);
  assertExactKeys("dialogue tree keys", source.keys, DIALOGUE_TREE_IDS);
  const rawTrees = recordLike(source.trees, "Dialogue content must be a JSON object.");
  const requiredTreeKeys = DIALOGUE_TREE_IDS.map((id) => requiredNonEmptyString(source.keys, id, "dialogue tree keys"));
  if (new Set(requiredTreeKeys).size !== requiredTreeKeys.length) {
    throw new Error("Dialogue tree keys must be unique.");
  }
  assertExactKeys("dialogue trees", rawTrees, requiredTreeKeys);

  const trees = new Map<string, DialogueTree>();
  for (const treeKey of requiredTreeKeys) {
    trees.set(treeKey, validateDialogueTree(treeKey, rawTrees[treeKey], audio));
  }
  const registry = createCodeRegistry("dialogue tree", DIALOGUE_TREE_IDS);
  assertUint8Registry("dialogue trees", DIALOGUE_TREE_IDS);

  return Object.freeze({
    start(id: DialogueTreeId): DialogueTreeStart {
      const treeKey = requiredEntry(source.keys, registry.assert(id, "dialogue start"), "dialogue tree key");
      const tree = requiredMapEntry(trees, treeKey, "dialogue tree");
      return deepFreeze({ treeKey, node: requiredEntry(tree.nodes, tree.start, `dialogue tree "${treeKey}"`) });
    },
    node(treeKey: string, nodeId: string): DialogueNode {
      const tree = requiredMapEntry(trees, treeKey, "dialogue tree");
      return requiredEntry(tree.nodes, nodeId, `dialogue tree "${treeKey}" node`);
    },
    code(id: DialogueTreeId): number {
      return registry.encode(id);
    },
    idForCode(code: number): DialogueTreeId {
      return registry.decode(code);
    },
  });
}

function compileAudio(source: GameCatalogSource["audio"]): AudioContent {
  assertExactKeys("audio source", source, ["tracks", "sounds", "voices"]);
  assertStableVocabulary("sounds", SOUND_IDS, STABLE_SOUND_CODES);
  assertExactKeys("music tracks", source.tracks, TRACK_IDS);
  assertExactKeys("sounds", source.sounds, SOUND_IDS);
  assertExactKeys("voices", source.voices, VOICE_IDS);
  const soundRegistry = createCodeRegistry("sound id", SOUND_IDS);
  assertUint8Registry("sounds", SOUND_IDS);

  for (const id of TRACK_IDS) {
    const track = requiredEntry(source.tracks, id, "music track");
    assertExactKeys(`music track "${id}"`, track, ["src", "volume", "loop"]);
    if (
      typeof track.src !== "string" || track.src.length === 0 || !isNonNegativeNumber(track.volume) ||
      typeof track.loop !== "boolean"
    ) {
      throw new Error(`Invalid music track "${id}".`);
    }
  }
  for (const id of SOUND_IDS) {
    const sound = requiredEntry(source.sounds, id, "sound");
    assertExactKeys(`sound "${id}"`, sound, ["soundId", "src", "category", "volume", "radius", "loop"]);
    if (
      sound.soundId !== id || typeof sound.src !== "string" || sound.src.length === 0 ||
      (sound.category !== "ambient" && sound.category !== "sfx") ||
      !isNonNegativeNumber(sound.volume) || !isNonNegativeNumber(sound.radius) ||
      typeof sound.loop !== "boolean"
    ) {
      throw new Error(`Invalid sound entry "${id}".`);
    }
  }
  for (const id of VOICE_IDS) requiredNonEmptyString(source.voices, id, "voice");

  return Object.freeze({
    track(id: TrackId): MusicTrack {
      return requiredEntry(source.tracks, id, "music track");
    },
    sound(id: SoundId): SoundCatalogEntry {
      return requiredEntry(source.sounds, id, "sound");
    },
    soundCode(id: SoundId): number {
      return soundRegistry.encode(id);
    },
    soundIdForCode(code: number): SoundId {
      return soundRegistry.decode(code);
    },
    voiceSource(id: VoiceId): string {
      return requiredNonEmptyString(source.voices, id, "voice");
    },
  });
}

function compilePresentation(source: GameCatalogSource["presentation"]): PresentationContent {
  assertExactKeys("presentation source", source, [
    "appearances",
    "displayNameSprites",
    "enemySprites",
    "itemSprites",
    "keySprites",
    "weaponSprites",
    "decorationSprites",
  ]);
  assertStableVocabulary("key colors", KEY_COLORS, STABLE_KEY_COLOR_CODES);
  assertUint8Values("sprite ids", SPRITE_IDS);
  assertExactKeys("sprite appearances", source.appearances, SPRITE_IDS);
  assertExactKeys("display-name sprites", source.displayNameSprites, DISPLAY_NAME_IDS);
  assertExactKeys("enemy sprites", source.enemySprites, ENEMY_ARCHETYPE_KEYS);
  assertExactKeys("item sprites", source.itemSprites, FIXED_ITEM_KINDS);
  assertExactKeys("key sprites", source.keySprites, KEY_COLORS);
  assertExactKeys("weapon sprites", source.weaponSprites, PICKUP_WEAPON_SLOTS);
  assertExactKeys("decoration sprites", source.decorationSprites, DECORATION_KINDS);

  for (const id of SPRITE_IDS) {
    const appearance = requiredEntry(source.appearances, id, "sprite appearance");
    assertAllowedKeys(`sprite appearance "${id}"`, appearance, ["shape", "color", "symbol"]);
    if (
      !TOP_DOWN_SHAPES.includes(appearance.shape) || typeof appearance.color !== "string" ||
      appearance.color.length === 0 ||
      (appearance.symbol !== undefined && typeof appearance.symbol !== "string")
    ) {
      throw new Error(`Invalid sprite appearance "${id}".`);
    }
  }

  function assertSprite(id: SpriteIdType): SpriteIdType {
    requiredEntry(source.appearances, id, "sprite appearance");
    return id;
  }

  return Object.freeze({
    appearance(id: SpriteIdType): TopDownSpriteAppearance {
      return requiredEntry(source.appearances, id, "sprite appearance");
    },
    spriteForDisplayName(id: DisplayName): SpriteIdType {
      return assertSprite(requiredEntry(source.displayNameSprites, id, "display-name sprite"));
    },
    spriteForItem(kind: ItemKind, value: number): SpriteIdType {
      if (kind === ItemKind.Key) {
        const color = KEY_COLORS[value - 1];
        if (color === undefined) throw new Error(`Unknown key color code: ${value}`);
        return assertSprite(requiredEntry(source.keySprites, color, "key sprite"));
      }
      if (kind === ItemKind.Weapon) {
        if (!PICKUP_WEAPON_SLOTS.includes(value as PickupWeaponSlot)) {
          throw new Error(`Unknown pickup weapon slot: ${value}`);
        }
        return assertSprite(requiredEntry(source.weaponSprites, value as PickupWeaponSlot, "weapon sprite"));
      }
      if (!FIXED_ITEM_KINDS.includes(kind as FixedItemKind)) throw new Error(`Unknown item kind code: ${kind}`);
      return assertSprite(requiredEntry(source.itemSprites, kind as FixedItemKind, "item sprite"));
    },
    spriteForDecoration(kind: DecorationKind): SpriteIdType {
      return assertSprite(requiredEntry(source.decorationSprites, kind, "decoration sprite"));
    },
  });
}

function validateCatalog(catalog: GameCatalog): void {
  for (const id of TRACK_IDS) catalog.audio.track(id);
  for (const level of catalog.levels.all) {
    catalog.audio.track(level.music);
    const code = catalog.levels.codeForDestination(level.map.name);
    assertUint32Code(code, `terminal destination ${level.map.name}`);
    const destination = catalog.levels.destinationForCode(code);
    if (destination.kind !== "level" || destination.level !== level) {
      throw new Error(`Level destination "${level.map.name}" does not preserve identity.`);
    }
    for (const entity of level.map.entities) validateEntity(entity, catalog);
    validateMapStoryJoins(level.map, catalog.simulation);
  }

  const defaultEnemy = catalog.simulation.enemyForCode(catalog.simulation.defaultEnemy);
  validateEnemy(defaultEnemy, catalog);
  for (const key of ENEMY_ARCHETYPE_KEYS) validateEnemy(catalog.simulation.enemyForKey(key), catalog);
  for (const [index, id] of DISPLAY_NAME_IDS.entries()) {
    const code = catalog.simulation.displayNameCode(id);
    assertStableCode(code, index + 1, `display name ${id}`);
    const resolved = catalog.simulation.displayNameForCode(code);
    if (resolved.id !== id || resolved.text.length === 0) throw new Error(`Display name "${id}" does not round-trip.`);
    catalog.presentation.appearance(catalog.presentation.spriteForDisplayName(id));
  }
  for (const [index, id] of EXAMINE_TEXT_IDS.entries()) {
    const code = catalog.simulation.examineTextCode(id);
    assertStableCode(code, index + 1, `examine text ${id}`);
    if (catalog.simulation.examineTextForCode(code).length === 0) throw new Error(`Empty examine text "${id}".`);
  }
  for (const [index, id] of STORY_EVENT_IDS.entries()) {
    const code = catalog.simulation.storyEventCode(id);
    assertStableCode(code, index + 1, `story event ${id}`);
    if (catalog.simulation.storyEventForCode(code) !== id) throw new Error(`Story event "${id}" does not round-trip.`);
    const event = catalog.simulation.storyEvent(id);
    catalog.simulation.storyEventCode(event.flag);
    for (const action of event.actions) catalog.simulation.storyTargetCode(action.target);
  }
  for (const [index, id] of STORY_TARGET_IDS.entries()) {
    const code = catalog.simulation.storyTargetCode(id);
    assertStableCode(code, index + 1, `story target ${id}`);
    if (catalog.simulation.storyTargetForCode(code) !== id) {
      throw new Error(`Story target "${id}" does not round-trip.`);
    }
  }
  for (const slot of COMMAND_SLOTS) catalog.simulation.weapon(slot);
  for (const kind of FIXED_ITEM_KINDS) catalog.presentation.appearance(catalog.presentation.spriteForItem(kind, 0));
  KEY_COLORS.forEach((_, index) => {
    catalog.presentation.appearance(catalog.presentation.spriteForItem(ItemKind.Key, index + 1));
  });
  for (const slot of PICKUP_WEAPON_SLOTS) {
    catalog.presentation.appearance(catalog.presentation.spriteForItem(ItemKind.Weapon, slot));
  }
  for (const kind of DECORATION_KINDS) {
    catalog.presentation.appearance(catalog.presentation.spriteForDecoration(kind));
  }
  SOUND_IDS.forEach((id, index) => {
    const code = catalog.audio.soundCode(id);
    assertStableCode(code, index + 1, `sound ${id}`);
    if (catalog.audio.soundIdForCode(code) !== id || catalog.audio.sound(id).soundId !== id) {
      throw new Error(`Sound "${id}" does not round-trip.`);
    }
  });
  DIALOGUE_TREE_IDS.forEach((id, index) => {
    const code = catalog.dialogue.code(id);
    assertStableCode(code, index + 1, `dialogue tree ${id}`);
    if (catalog.dialogue.idForCode(code) !== id) throw new Error(`Dialogue tree "${id}" does not round-trip.`);
    catalog.dialogue.start(id);
  });
}

function validateEnemy(enemy: CompiledEnemy, catalog: GameCatalog): void {
  catalog.simulation.displayNameCode(enemy.definition.displayName);
  catalog.presentation.appearance(enemy.sprite);
  const sounds = enemy.definition.sounds;
  for (const id of [sounds.idle.soundId, sounds.alert, sounds.attack, sounds.hurt, sounds.defeat]) {
    catalog.audio.sound(id);
  }
}

function validateEntity(entity: GameMap["entities"][number], catalog: GameCatalog): void {
  if ("examineTextId" in entity && entity.examineTextId !== undefined) {
    catalog.simulation.examineTextCode(entity.examineTextId);
  }
  switch (entity.prefab) {
    case "npc":
      catalog.simulation.displayNameCode(entity.displayName);
      catalog.presentation.spriteForDisplayName(entity.displayName);
      if (entity.dialogueTreeId !== undefined) catalog.dialogue.code(entity.dialogueTreeId);
      if (entity.storyId !== undefined) catalog.simulation.storyTargetCode(entity.storyId);
      if (entity.onTalkEvent !== undefined) catalog.simulation.storyEventCode(entity.onTalkEvent);
      return;
    case "enemy": {
      const enemy = entity.archetype === undefined ?
        catalog.simulation.enemyForCode(catalog.simulation.defaultEnemy) :
        catalog.simulation.enemyForKey(entity.archetype);
      catalog.presentation.appearance(enemy.sprite);
      if (entity.displayName !== undefined) catalog.simulation.displayNameCode(entity.displayName);
      return;
    }
    case "key": {
      const code = KEY_COLORS.indexOf(entity.color) + 1;
      catalog.presentation.appearance(catalog.presentation.spriteForItem(ItemKind.Key, code));
      return;
    }
    case "uplinkCode":
      catalog.presentation.appearance(catalog.presentation.spriteForItem(ItemKind.UplinkCode, 0));
      return;
    case "uplinkTerminal":
      catalog.levels.codeForDestination(entity.goto);
      return;
    case "weaponPickup":
      catalog.simulation.weapon(entity.slot);
      catalog.presentation.appearance(catalog.presentation.spriteForItem(ItemKind.Weapon, entity.slot));
      return;
    case "item":
      catalog.presentation.appearance(
        catalog.presentation.spriteForItem(catalog.simulation.itemKindForKey(entity.item), entity.amount),
      );
      return;
    case "decoration":
      catalog.presentation.appearance(catalog.presentation.spriteForDecoration(entity.decoration));
      return;
    case "sound":
      catalog.audio.sound(entity.soundId);
      return;
    case "spearPickup":
      catalog.presentation.appearance(catalog.presentation.spriteForItem(ItemKind.Spear, 0));
      return;
    case "player":
    case "door":
    case "light":
    case "spearTurret":
      return;
  }
}

function validateMapStoryJoins(map: GameMap, simulation: SimulationContent): void {
  const targets = new Map<StoryTargetId, number>();
  for (const entity of map.entities) {
    if (entity.prefab !== "npc" || entity.storyId === undefined) continue;
    targets.set(entity.storyId, (targets.get(entity.storyId) ?? 0) + 1);
  }
  for (const [id, count] of targets) {
    if (count > 1) throw new Error(`Map "${map.name}" has ${count} entities for story target "${id}".`);
  }

  const { width, height } = mapDimensions(map);
  for (const entity of map.entities) {
    if (entity.prefab !== "npc" || entity.onTalkEvent === undefined) continue;
    const event = simulation.storyEvent(entity.onTalkEvent);
    for (const action of event.actions) {
      if (targets.get(action.target) !== 1) {
        throw new Error(
          `Map "${map.name}" event "${entity.onTalkEvent}" requires one story target "${action.target}".`,
        );
      }
      const { x, y } = action.destination;
      if (x < 0 || y < 0 || x >= width || y >= height) {
        throw new Error(
          `Map "${map.name}" event "${entity.onTalkEvent}" destination (${x},${y}) is outside the map.`,
        );
      }
    }
  }
}

function validateDialogueTree(key: string, rawTree: unknown, audio: AudioContent): DialogueTree {
  const value = recordLike(rawTree, `Dialogue tree "${key}" must be a JSON object.`);
  assertExactKeys(`dialogue tree "${key}"`, value, ["start", "nodes"]);
  const rawNodes = recordLike(value.nodes, `Dialogue tree "${key}" must have at least one node.`);
  if (Object.keys(rawNodes).length === 0) throw new Error(`Dialogue tree "${key}" must have at least one node.`);

  const nodes: Record<string, DialogueNode> = {};
  for (const [nodeId, rawNode] of Object.entries(rawNodes)) {
    nodes[nodeId] = validateDialogueNode(key, nodeId, rawNode, audio);
  }
  const start = value.start;
  if (typeof start !== "string" || nodes[start] === undefined) {
    throw new Error(`Dialogue tree "${key}" start must name one of its nodes.`);
  }
  for (const [nodeId, node] of Object.entries(nodes)) {
    for (const choice of node.choices) {
      if (choice.next !== undefined && nodes[choice.next] === undefined) {
        throw new Error(`Dialogue tree "${key}" node "${nodeId}" links to unknown node "${choice.next}".`);
      }
    }
  }
  return deepFreeze({ start, nodes });
}

function validateDialogueNode(key: string, nodeId: string, rawNode: unknown, audio: AudioContent): DialogueNode {
  const value = recordLike(rawNode, `Dialogue tree "${key}" node "${nodeId}" must be a JSON object.`);
  assertAllowedKeys(`dialogue tree "${key}" node "${nodeId}"`, value, ["text", "voice", "choices"]);
  const text = value.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error(`Dialogue tree "${key}" node "${nodeId}" must have non-empty text.`);
  }
  const voice = value.voice;
  if (voice !== undefined) {
    if (typeof voice !== "string" || !VOICE_IDS.includes(voice as VoiceId)) {
      throw new Error(`Dialogue tree "${key}" node "${nodeId}" has unknown voice "${String(voice)}".`);
    }
    audio.voiceSource(voice as VoiceId);
  }
  const rawChoices = value.choices;
  const choices = validateDialogueChoices(key, nodeId, rawChoices);
  return deepFreeze(voice === undefined ? { text, choices } : { text, voice: voice as VoiceId, choices });
}

function validateDialogueChoices(key: string, nodeId: string, rawChoices: unknown): readonly DialogueChoice[] {
  if (!Array.isArray(rawChoices) || rawChoices.length === 0 || rawChoices.length > MAX_DIALOGUE_CHOICES) {
    throw new Error(`Dialogue tree "${key}" node "${nodeId}" must have 1 to ${MAX_DIALOGUE_CHOICES} choices.`);
  }
  return rawChoices.map((rawChoice, index) => {
    const value = recordLike(
      rawChoice,
      `Dialogue tree "${key}" node "${nodeId}" choice ${index} must be a JSON object.`,
    );
    assertAllowedKeys(`dialogue tree "${key}" node "${nodeId}" choice ${index}`, value, ["label", "next"]);
    const label = value.label;
    if (typeof label !== "string" || label.trim().length === 0) {
      throw new Error(`Dialogue tree "${key}" node "${nodeId}" choice ${index} must have a non-empty label.`);
    }
    const next = value.next;
    if (next !== undefined && typeof next !== "string") {
      throw new Error(`Dialogue tree "${key}" node "${nodeId}" choice ${index} next must be a node id.`);
    }
    return next === undefined ? { label } : { label, next };
  });
}

function validateAuthoredEnemy(value: unknown, key: EnemyArchetypeKey): asserts value is AuthoredEnemy {
  const label = `enemy "${key}"`;
  const enemy = recordLike(value, `${label} must be an object.`);
  assertExactKeys(label, enemy, [
    "displayName",
    "health",
    "hitDc",
    "damage",
    "attack",
    "behavior",
    "senses",
    "sounds",
  ]);
  if (!DISPLAY_NAME_IDS.includes(enemy.displayName as DisplayName)) {
    throw new Error(`${label} has an invalid display name.`);
  }
  requireIntegerBetween(enemy.health, 1, 0xff, `${label} health`);
  requireIntegerBetween(enemy.hitDc, 1, 0xff, `${label} hit DC`);
  requireIntegerBetween(enemy.damage, 0, 0xff, `${label} damage`);
  validateAttack(enemy.attack, `${label} attack`, true);

  const behavior = recordLike(enemy.behavior, `${label} behavior must be an object.`);
  assertExactKeys(`${label} behavior`, behavior, ["alert", "investigate"]);
  const alert = recordLike(behavior.alert, `${label} alert behavior must be an object.`);
  switch (alert.type) {
    case "advance":
      assertAllowedKeys(`${label} advance behavior`, alert, ["type", "steps", "attackAfterMove"]);
      requireIntegerAtLeast(alert.steps, 1, `${label} advance steps`);
      if (alert.attackAfterMove !== undefined && typeof alert.attackAfterMove !== "boolean") {
        throw new Error(`${label} attackAfterMove must be boolean.`);
      }
      break;
    case "skirmish":
      assertExactKeys(`${label} skirmish behavior`, alert, ["type", "retreatRange", "advanceSteps"]);
      requireIntegerAtLeast(alert.retreatRange, 0, `${label} retreat range`);
      requireIntegerAtLeast(alert.advanceSteps, 1, `${label} advance steps`);
      break;
    case "hold":
      assertExactKeys(`${label} hold behavior`, alert, ["type"]);
      break;
    default:
      throw new Error(`${label} has unknown alert behavior "${String(alert.type)}".`);
  }
  const investigate = recordLike(behavior.investigate, `${label} investigate behavior must be an object.`);
  switch (investigate.type) {
    case "move":
      assertExactKeys(`${label} move investigation`, investigate, ["type", "steps"]);
      requireIntegerAtLeast(investigate.steps, 1, `${label} investigate steps`);
      break;
    case "watch":
      assertExactKeys(`${label} watch investigation`, investigate, ["type"]);
      break;
    default:
      throw new Error(`${label} has unknown investigate behavior "${String(investigate.type)}".`);
  }

  const senses = recordLike(enemy.senses, `${label} senses must be an object.`);
  assertExactKeys(`${label} senses`, senses, ["sightRadius", "hearingRadius"]);
  requireIntegerAtLeast(senses.sightRadius, 0, `${label} sight radius`);
  requireIntegerAtLeast(senses.hearingRadius, 0, `${label} hearing radius`);
  const sounds = recordLike(enemy.sounds, `${label} sounds must be an object.`);
  assertExactKeys(`${label} sounds`, sounds, ["idle", "alert", "attack", "hurt", "defeat"]);
  const idle = recordLike(sounds.idle, `${label} idle sound must be an object.`);
  assertExactKeys(`${label} idle sound`, idle, ["soundId", "radius", "volume", "minDelayMs", "maxDelayMs"]);
  requireSoundId(idle.soundId, `${label} idle sound`);
  requireNonNegativeNumber(idle.radius, `${label} idle sound radius`);
  requireUnitNumber(idle.volume, `${label} idle sound volume`);
  requireNonNegativeNumber(idle.minDelayMs, `${label} idle minimum delay`);
  requireNonNegativeNumber(idle.maxDelayMs, `${label} idle maximum delay`);
  if ((idle.maxDelayMs as number) < (idle.minDelayMs as number)) {
    throw new Error(`${label} idle maximum delay precedes its minimum delay.`);
  }
  for (const field of ["alert", "attack", "hurt", "defeat"] as const) {
    requireSoundId(sounds[field], `${label} ${field} sound`);
  }
}

function validateWeapon(value: unknown, slot: CommandSlot): asserts value is PlayerWeaponSpec {
  const label = `weapon ${slot}`;
  const weapon = recordLike(value, `${label} must be an object.`);
  if (typeof weapon.label !== "string" || weapon.label.trim().length === 0) {
    throw new Error(`${label} must have a non-empty label.`);
  }
  if (weapon.ammo !== undefined && weapon.ammo !== "pistol" && weapon.ammo !== "cannon") {
    throw new Error(`${label} has unknown ammo "${String(weapon.ammo)}".`);
  }
  requireNonNegativeNumber(weapon.noiseRadius, `${label} noise radius`);
  validateAttack(weapon, label, false, ["label", "ammo", "noiseRadius"]);
}

function validateAttack(
  value: unknown,
  label: string,
  partial: boolean,
  additionalFields: readonly string[] = [],
): void {
  const attack = recordLike(value, `${label} must be an object.`);
  assertAllowedKeys(label, attack, [...ATTACK_FIELD_NAMES, ...additionalFields]);
  const unsignedFields = [
    "minDamage",
    "maxDamage",
    "range",
    "critThreshold",
    "critMultiplier",
  ] as const satisfies readonly (keyof AttackDef)[];
  for (const field of unsignedFields) {
    if (attack[field] === undefined && partial) continue;
    requireIntegerBetween(attack[field], field === "critMultiplier" ? 1 : 0, 0xff, `${label} ${field}`);
  }
  if (attack.attackBonus !== undefined || !partial) {
    requireIntegerBetween(attack.attackBonus, -0x80, 0x7f, `${label} attackBonus`);
  }
  if (
    attack.minDamage !== undefined && attack.maxDamage !== undefined &&
    (attack.maxDamage as number) < (attack.minDamage as number)
  ) {
    throw new Error(`${label} maximum damage is below minimum damage.`);
  }
  if (attack.pattern === undefined && !partial) throw new Error(`${label} is missing pattern.`);
  if (attack.pattern !== undefined && !ATTACK_PATTERNS.includes(attack.pattern as AttackPattern)) {
    throw new Error(`${label} has invalid pattern.`);
  }
  if (attack.targets === undefined && !partial) throw new Error(`${label} is missing targets.`);
  if (attack.targets !== undefined && !ATTACK_TARGET_MODES.includes(attack.targets as AttackTargetMode)) {
    throw new Error(`${label} has invalid targets.`);
  }
}

function validateStoryEvent(value: unknown, id: StoryEventId, targets: readonly StoryTargetId[]): void {
  const label = `story event "${id}"`;
  const event = recordLike(value, `${label} must be an object.`);
  assertExactKeys(label, event, ["flag", "actions"]);
  if (!STORY_EVENT_IDS.includes(event.flag as StoryEventId)) throw new Error(`${label} has an invalid flag.`);
  if (!Array.isArray(event.actions)) throw new Error(`${label} actions must be an array.`);
  for (const [index, rawAction] of event.actions.entries()) {
    const action = recordLike(rawAction, `${label} action ${index} must be an object.`);
    assertExactKeys(`${label} action ${index}`, action, ["type", "target", "destination"]);
    if (action.type !== "moveEntity") throw new Error(`${label} action ${index} has an invalid type.`);
    if (!targets.includes(action.target as StoryTargetId)) {
      throw new Error(`${label} action ${index} has an invalid target.`);
    }
    const destination = recordLike(
      action.destination,
      `${label} action ${index} destination must be an object.`,
    );
    assertExactKeys(`${label} action ${index} destination`, destination, ["x", "y"]);
    requireIntegerAtLeast(destination.x, 0, `${label} action ${index} destination x`);
    requireIntegerAtLeast(destination.y, 0, `${label} action ${index} destination y`);
  }
}

function requireSoundId(value: unknown, label: string): asserts value is SoundId {
  if (!SOUND_IDS.includes(value as SoundId)) throw new Error(`${label} has an invalid sound id.`);
}

function requireIntegerAtLeast(value: unknown, minimum: number, label: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer of at least ${minimum}.`);
  }
}

function requireIntegerBetween(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): asserts value is number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function requireNonNegativeNumber(value: unknown, label: string): asserts value is number {
  if (!isNonNegativeNumber(value)) throw new Error(`${label} must be a non-negative number.`);
}

function requireUnitNumber(value: unknown, label: string): asserts value is number {
  if (!isNonNegativeNumber(value) || value > 1) throw new Error(`${label} must be between 0 and 1.`);
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function cloneCatalogSource(source: unknown): GameCatalogSource {
  const value = recordLike(source, "Invalid game catalog source.");
  const sourceKeys = ["campaign", "musicByMap", "simulation", "dialogue", "audio", "presentation"] as const;
  assertExactKeys("game catalog source", value, sourceKeys);
  for (const key of sourceKeys) {
    recordLike(value[key], `Invalid game catalog source: ${key} must be an object.`);
  }
  try {
    return deepFreeze(structuredClone(value)) as GameCatalogSource;
  } catch (error) {
    throw new Error("Invalid game catalog source: authored content must be plain cloneable data.", { cause: error });
  }
}

function assertExactKeys(
  label: string,
  value: unknown,
  expected: Iterable<string | number>,
): asserts value is Readonly<Record<PropertyKey, unknown>> {
  const record = recordLike(value, `${label} must be an object.`);
  const expectedKeys = new Set(Array.from(expected, String));
  const actualKeys = Object.keys(record);
  const missing = [...expectedKeys].filter((key) => !Object.hasOwn(record, key));
  const stray = actualKeys.filter((key) => !expectedKeys.has(key));
  if (missing.length > 0 || stray.length > 0) {
    throw new Error(
      `Invalid ${label}: ${
        [
          ...missing.map((key) => `missing "${key}"`),
          ...stray.map((key) => `unknown "${key}"`),
        ].join(", ")
      }.`,
    );
  }
}

function assertAllowedKeys(
  label: string,
  value: unknown,
  allowed: Iterable<string | number>,
): asserts value is Readonly<Record<PropertyKey, unknown>> {
  const record = recordLike(value, `${label} must be an object.`);
  const allowedKeys = new Set(Array.from(allowed, String));
  const stray = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (stray.length > 0) {
    throw new Error(`Invalid ${label}: ${stray.map((key) => `unknown "${key}"`).join(", ")}.`);
  }
}

function assertOrderedIds<T extends string>(label: string, actual: readonly T[], expected: readonly T[]): void {
  if (
    !Array.isArray(actual) || actual.length !== expected.length || actual.some((id, index) => id !== expected[index])
  ) {
    throw new Error(`${label} must preserve the stable code order.`);
  }
}

function assertStableVocabulary<T extends string>(
  label: string,
  ids: readonly T[],
  stableCodes: Readonly<Record<T, number>>,
): void {
  assertExactKeys(`${label} stable codes`, stableCodes, ids);
  for (const [index, id] of ids.entries()) {
    const expected = requiredEntry(stableCodes, id, `${label} stable code`);
    if (expected !== index + 1) {
      throw new Error(`${label} code order drifted: "${id}" must remain code ${expected}.`);
    }
  }
}

function assertUint8Registry(label: string, ids: readonly unknown[]): void {
  if (ids.length === 0 || ids.length > 0xff) throw new Error(`${label} do not fit Uint8 storage.`);
}

function assertUint8Values(label: string, values: readonly number[]): void {
  if (
    new Set(values).size !== values.length ||
    values.some((value) => !Number.isInteger(value) || value < 1 || value > 0xff)
  ) {
    throw new Error(`${label} must be unique positive Uint8 values.`);
  }
}

function assertUint32Code(code: number, label: string): void {
  if (!Number.isInteger(code) || code < 1 || code > 0xffff_ffff) {
    throw new Error(`${label} code ${code} does not fit Uint32 storage.`);
  }
}

function assertStableCode(code: number, expected: number, label: string): void {
  if (code !== expected || code < 1 || code > 0xff) {
    throw new Error(`${label} code changed from ${expected} to ${code}.`);
  }
}

function requiredEntry<T>(record: Readonly<Record<PropertyKey, T>>, key: PropertyKey, label: string): T {
  const value = record[key];
  if (value === undefined) throw new Error(`Unknown ${label} "${String(key)}".`);
  return value;
}

function requiredNonEmptyString(
  record: Readonly<Record<PropertyKey, unknown>>,
  key: PropertyKey,
  label: string,
): string {
  const value = requiredEntry(record, key, label);
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`Invalid ${label} "${String(key)}".`);
  return value;
}

function requiredMapEntry<K, V>(map: ReadonlyMap<K, V>, key: K, label: string): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Unknown ${label} "${String(key)}".`);
  return value;
}

function recordLike(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

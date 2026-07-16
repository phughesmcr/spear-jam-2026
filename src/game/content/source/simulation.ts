import { type EnemyArchetypeKey, type EnemyCatalogEntry } from "@/src/game/content/enemies.ts";
import { EXAMINE_TEXT_IDS, ExamineTextId } from "@/src/game/content/examine_text.ts";
import { ItemKind, MapItemKind, type MapItemKind as MapItemKindType } from "@/src/game/content/items.ts";
import { DISPLAY_NAME_IDS, DisplayName } from "@/src/game/content/names.ts";
import {
  STORY_EVENT_IDS,
  STORY_TARGET_IDS,
  type StoryEventDefinition,
  StoryEventId,
} from "@/src/game/content/story.ts";
import type { PlayerWeaponSpec } from "@/src/game/content/weapons.ts";
import { type AttackDef, AttackPattern, AttackTargetMode } from "@/src/game/model/attack.ts";
import { SoundId } from "@/src/game/model/sound.ts";
import type { CommandSlot } from "@/src/game/model/state.ts";

type AuthoredEnemy = Omit<EnemyCatalogEntry, "attack"> & {
  readonly attack: Readonly<Partial<AttackDef>>;
};

export const SHIPPED_SIMULATION_SOURCE = {
  defaultEnemy: "meleeDog",
  enemies: {
    meleeDog: {
      displayName: DisplayName.DigitalDog,
      health: 2,
      hitDc: 10,
      damage: 1,
      attack: { attackBonus: 4, range: 1 },
      behavior: {
        alert: { type: "advance", steps: 2, attackAfterMove: true },
        investigate: { type: "move", steps: 1 },
      },
      senses: { sightRadius: 4, hearingRadius: 7 },
      sounds: {
        idle: { soundId: SoundId.DogIdle, radius: 5, volume: 0.42, minDelayMs: 7_000, maxDelayMs: 14_000 },
        alert: SoundId.DogAlert,
        attack: SoundId.DogAttack,
        hurt: SoundId.DogHurt,
        defeat: SoundId.DogDefeat,
      },
    },
    gunslinger: {
      displayName: DisplayName.GigabitGunslinger,
      health: 4,
      hitDc: 10,
      damage: 1,
      attack: { attackBonus: 3, range: 3 },
      behavior: {
        alert: { type: "skirmish", retreatRange: 1, advanceSteps: 1 },
        investigate: { type: "move", steps: 1 },
      },
      senses: { sightRadius: 5, hearingRadius: 6 },
      sounds: {
        idle: {
          soundId: SoundId.GunslingerIdle,
          radius: 5,
          volume: 0.42,
          minDelayMs: 7_000,
          maxDelayMs: 14_000,
        },
        alert: SoundId.GunslingerAlert,
        attack: SoundId.GunslingerAttack,
        hurt: SoundId.GunslingerHurt,
        defeat: SoundId.GunslingerDefeat,
      },
    },
    networkNeophyte: {
      displayName: DisplayName.NetworkNeophyte,
      health: 6,
      hitDc: 10,
      damage: 1,
      attack: { attackBonus: 2, range: 3 },
      behavior: {
        alert: { type: "skirmish", retreatRange: 2, advanceSteps: 1 },
        investigate: { type: "move", steps: 1 },
      },
      senses: { sightRadius: 5, hearingRadius: 7 },
      sounds: {
        idle: {
          soundId: SoundId.NeophyteIdle,
          radius: 5,
          volume: 0.42,
          minDelayMs: 7_000,
          maxDelayMs: 14_000,
        },
        alert: SoundId.NeophyteAlert,
        attack: SoundId.NeophyteAttack,
        hurt: SoundId.NeophyteHurt,
        defeat: SoundId.NeophyteDefeat,
      },
    },
    systemSentinel: {
      displayName: DisplayName.SystemSentinel,
      health: 10,
      hitDc: 10,
      damage: 2,
      attack: { attackBonus: 4, range: 1 },
      behavior: {
        alert: { type: "hold" },
        investigate: { type: "watch" },
      },
      senses: { sightRadius: 1, hearingRadius: 1 },
      sounds: {
        idle: {
          soundId: SoundId.SentinelIdle,
          radius: 5,
          volume: 0.42,
          minDelayMs: 7_000,
          maxDelayMs: 14_000,
        },
        alert: SoundId.SentinelAlert,
        attack: SoundId.SentinelAttack,
        hurt: SoundId.SentinelHurt,
        defeat: SoundId.SentinelDefeat,
      },
    },
    agenticAcolyte: {
      displayName: DisplayName.AgenticAcolyte,
      health: 6,
      hitDc: 10,
      damage: 2,
      attack: {
        attackBonus: 3,
        range: 2,
        pattern: AttackPattern.Adjacent,
        targets: AttackTargetMode.All,
      },
      behavior: {
        alert: { type: "advance", steps: 1, attackAfterMove: true },
        investigate: { type: "move", steps: 1 },
      },
      senses: { sightRadius: 5, hearingRadius: 7 },
      sounds: {
        idle: {
          soundId: SoundId.AcolyteIdle,
          radius: 5,
          volume: 0.42,
          minDelayMs: 7_000,
          maxDelayMs: 14_000,
        },
        alert: SoundId.AcolyteAlert,
        attack: SoundId.AcolyteAttack,
        hurt: SoundId.AcolyteHurt,
        defeat: SoundId.AcolyteDefeat,
      },
    },
  } satisfies Readonly<Record<EnemyArchetypeKey, AuthoredEnemy>>,
  itemKinds: {
    [MapItemKind.HealthPatch]: ItemKind.HealthPatch,
    [MapItemKind.PistolAmmo]: ItemKind.PistolAmmo,
    [MapItemKind.CannonAmmo]: ItemKind.CannonAmmo,
  } satisfies Readonly<Record<MapItemKindType, ItemKind>>,
  displayNames: {
    [DisplayName.John]: "John",
    [DisplayName.DigitalDog]: "Digital Dog",
    [DisplayName.GigabitGunslinger]: "Gigabit Gunslinger",
    [DisplayName.NetworkNeophyte]: "Network Neophyte",
    [DisplayName.SystemSentinel]: "System Sentinel",
    [DisplayName.AgenticAcolyte]: "Agentic Acolyte",
  } satisfies Readonly<Record<(typeof DISPLAY_NAME_IDS)[number], string>>,
  examineTexts: {
    [ExamineTextId.BootSectorUplinkTerminal]: "The uplink terminal hums, waiting for a valid code.",
  } satisfies Readonly<Record<(typeof EXAMINE_TEXT_IDS)[number], string>>,
  storyEvents: {
    [StoryEventId.JohnSpoken]: {
      flag: StoryEventId.JohnSpoken,
      actions: [{
        type: "moveEntity",
        target: STORY_TARGET_IDS[0],
        destination: { x: 1, y: 3 },
      }],
    },
  } satisfies Readonly<Record<(typeof STORY_EVENT_IDS)[number], StoryEventDefinition>>,
  storyTargets: STORY_TARGET_IDS,
  weapons: {
    1: {
      label: "Bit Shifter",
      noiseRadius: 2,
      minDamage: 1,
      maxDamage: 3,
      range: 1,
      attackBonus: 4,
      critThreshold: 20,
      critMultiplier: 2,
      pattern: AttackPattern.Line,
      targets: AttackTargetMode.First,
    },
    2: {
      label: "Pulse Pistol",
      ammo: "pistol",
      noiseRadius: 6,
      minDamage: 2,
      maxDamage: 4,
      range: 4,
      attackBonus: 2,
      critThreshold: 20,
      critMultiplier: 2,
      pattern: AttackPattern.Line,
      targets: AttackTargetMode.First,
    },
    3: {
      label: "Current Cannon",
      ammo: "cannon",
      noiseRadius: 6,
      minDamage: 3,
      maxDamage: 8,
      range: 6,
      attackBonus: 1,
      critThreshold: 20,
      critMultiplier: 2,
      pattern: AttackPattern.Line,
      targets: AttackTargetMode.First,
    },
  } satisfies Readonly<Record<CommandSlot, PlayerWeaponSpec>>,
} as const;

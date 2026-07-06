import { type Entity, System } from "@phughesmcr/miski";
import { enemyArchetypeForCode, enemyCatalogEntry } from "@/src/ecs/enemy_catalog.ts";
import { enemyIdleSoundSourceQuery, soundEmitterQuery } from "@/src/ecs/queries.ts";
import { type EnemyIdleSoundSource, type SoundEmitterSnapshot, SoundId, soundIdForCode } from "@/src/game/sound.ts";

/** Receives a reused scratch object; copy fields before storing it past the callback. */
export type SoundEmitterVisitor = (sound: SoundEmitterSnapshot) => void;

/** Receives a reused scratch object; copy fields before storing it past the callback. */
export type EnemyIdleSoundSourceVisitor = (source: EnemyIdleSoundSource) => void;

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};
type SoundEmitterScratch = Mutable<SoundEmitterSnapshot>;
type EnemyIdleSoundSourceScratch = Mutable<EnemyIdleSoundSource>;

type SoundEmitterContext = {
  readonly visit: SoundEmitterVisitor;
  readonly scratch: SoundEmitterScratch;
};
type EnemyIdleSoundSourceContext = {
  readonly visit: EnemyIdleSoundSourceVisitor;
  readonly scratch: EnemyIdleSoundSourceScratch;
};

export type SoundEmitterSystem = (context: SoundEmitterContext) => void;
export type EnemyIdleSoundSourceSystem = (context: EnemyIdleSoundSourceContext) => void;

export function createSoundEmitterScratch(): SoundEmitterScratch {
  return {
    entity: 0 as Entity,
    soundId: SoundId.AmbientHum,
    x: 0,
    y: 0,
    radius: 1,
    volume: 1,
  };
}

export function createEnemyIdleSoundSourceScratch(): EnemyIdleSoundSourceScratch {
  return {
    entity: 0 as Entity,
    soundId: SoundId.EnemyIdle,
    x: 0,
    y: 0,
    radius: 5,
    volume: 0.42,
    minDelayMs: 7000,
    maxDelayMs: 14000,
  };
}

export const soundEmitterSystem = new System({
  name: "soundEmitterSystem",
  query: soundEmitterQuery,
  callback: (components, entities, context: SoundEmitterContext): void => {
    const positionX = components.gridPos.partitions.x;
    const positionY = components.gridPos.partitions.y;
    const soundEmitter = components.soundEmitter.partitions;
    for (let i = 0; i < entities.count; i++) {
      const entity = entities.indices[i]! as Entity;
      const scratch = context.scratch;
      scratch.entity = entity;
      scratch.soundId = soundIdForCode(soundEmitter.soundId[entity]!);
      scratch.x = positionX[entity]!;
      scratch.y = positionY[entity]!;
      scratch.radius = soundEmitter.radius[entity]!;
      scratch.volume = soundEmitter.volume[entity]!;
      context.visit(scratch);
    }
  },
});

export const enemyIdleSoundSourceSystem = new System({
  name: "enemyIdleSoundSourceSystem",
  query: enemyIdleSoundSourceQuery,
  callback: (components, enemies, context: EnemyIdleSoundSourceContext): void => {
    const positionX = components.gridPos.partitions.x;
    const positionY = components.gridPos.partitions.y;
    const archetypes = components.enemyArchetype.partitions.archetype;
    for (let i = 0; i < enemies.count; i++) {
      const entity = enemies.indices[i]! as Entity;
      const idleSound = enemyCatalogEntry(enemyArchetypeForCode(archetypes[entity]!)).idleSound;
      const scratch = context.scratch;
      scratch.entity = entity;
      scratch.soundId = idleSound.soundId;
      scratch.x = positionX[entity]!;
      scratch.y = positionY[entity]!;
      scratch.radius = idleSound.radius;
      scratch.volume = idleSound.volume;
      scratch.minDelayMs = idleSound.minDelayMs;
      scratch.maxDelayMs = idleSound.maxDelayMs;
      context.visit(scratch);
    }
  },
});

import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import {
  type EnemyIdleSoundSource,
  type EnemyIdleSoundSourceVisitor,
  type SoundEmitterSnapshot,
  type SoundEmitterVisitor,
  SoundId,
} from "@/src/game/model/sound.ts";
import type { Entity, SlotIndex } from "turn-based-engine/ecs";

export type SoundReaders = {
  readonly forEachSoundEmitter: (visit: SoundEmitterVisitor) => void;
  readonly forEachEnemyIdleSoundSource: (visit: EnemyIdleSoundSourceVisitor) => void;
};

export function createSoundReaders(runtime: GameRuntime): SoundReaders {
  const soundQuery = runtime.simulation.ecs.query(
    runtime.simulation.crawler.components.GridPosition,
    runtime.simulation.ecs.components.SoundEmitter,
  );
  const enemyQuery = runtime.simulation.ecs.query(
    runtime.simulation.crawler.components.GridPosition,
    runtime.simulation.ecs.components.Enemy,
    runtime.simulation.ecs.components.EnemyArchetype,
  );
  const sound: Mutable<SoundEmitterSnapshot> = {
    entity: 0 as Entity,
    soundId: SoundId.AmbientHum,
    x: 0,
    y: 0,
    radius: 1,
    volume: 1,
  };
  const enemy: Mutable<EnemyIdleSoundSource> = {
    entity: 0 as Entity,
    soundId: SoundId.DogIdle,
    x: 0,
    y: 0,
    radius: 5,
    volume: 0.42,
    minDelayMs: 7000,
    maxDelayMs: 14000,
  };
  let soundVisitor: SoundEmitterVisitor;
  let enemyVisitor: EnemyIdleSoundSourceVisitor;

  function visitSoundEmitter(entity: Entity, slot: SlotIndex): void {
    sound.entity = entity;
    sound.soundId = runtime.content.audio.soundIdForCode(
      runtime.simulation.ecs.storage.SoundEmitter.getAt(slot, "soundId"),
    );
    sound.x = runtime.simulation.crawler.storage.GridPosition.getAt(slot, "x");
    sound.y = runtime.simulation.crawler.storage.GridPosition.getAt(slot, "y");
    sound.radius = runtime.simulation.ecs.storage.SoundEmitter.getAt(slot, "radius");
    sound.volume = runtime.simulation.ecs.storage.SoundEmitter.getAt(slot, "volume");
    soundVisitor(sound);
  }

  function visitEnemyIdleSoundSource(entity: Entity, slot: SlotIndex): void {
    const idle = runtime.content.simulation.enemyForCode(
      runtime.simulation.ecs.storage.EnemyArchetype.getAt(slot, "archetype"),
    ).definition.sounds.idle;
    enemy.entity = entity;
    enemy.soundId = idle.soundId;
    enemy.x = runtime.simulation.crawler.storage.GridPosition.getAt(slot, "x");
    enemy.y = runtime.simulation.crawler.storage.GridPosition.getAt(slot, "y");
    enemy.radius = idle.radius;
    enemy.volume = idle.volume;
    enemy.minDelayMs = idle.minDelayMs;
    enemy.maxDelayMs = idle.maxDelayMs;
    enemyVisitor(enemy);
  }

  function forEachSoundEmitter(visit: SoundEmitterVisitor): void {
    soundVisitor = visit;
    soundQuery.forEach(visitSoundEmitter);
  }

  function forEachEnemyIdleSoundSource(visit: EnemyIdleSoundSourceVisitor): void {
    enemyVisitor = visit;
    enemyQuery.forEach(visitEnemyIdleSoundSource);
  }

  return { forEachSoundEmitter, forEachEnemyIdleSoundSource };
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

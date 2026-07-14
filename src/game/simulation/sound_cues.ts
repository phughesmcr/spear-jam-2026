import type { EnemySoundProfile } from "@/src/game/content/enemies.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import { type SoundCue, SoundId, weaponSoundId } from "@/src/game/model/sound.ts";
import type { CommandSlot } from "@/src/game/model/state.ts";
import type { GridPoint } from "@/src/game/world/direction.ts";
import type { Entity } from "turn-based-engine/ecs";

export type SoundCueContext = {
  readonly playerEntity: Entity;
  readonly playerPosition: GridPoint;
  readonly positionsBefore: ReadonlyMap<Entity, GridPoint>;
  readonly positionsAfter: ReadonlyMap<Entity, GridPoint>;
  readonly enemySounds: ReadonlyMap<Entity, EnemySoundProfile>;
  readonly blockedMove?: boolean;
  readonly dialogueTarget?: Entity;
  readonly playerWeaponSlot?: CommandSlot;
  readonly playerWeaponRadius?: number;
};

const BLOCKED_MOVE_RADIUS = 2;
const DOOR_OPEN_RADIUS = 5;
const DOOR_LOCKED_RADIUS = 3;
const PICKUP_RADIUS = 3;
const ENEMY_ATTACK_RADIUS = 5;
const ENEMY_ALERT_RADIUS = 6;
const ENEMY_INVESTIGATE_RADIUS = 4;
const ENEMY_HURT_RADIUS = 4;
const ENEMY_DEFEAT_RADIUS = 5;
const PLAYER_HURT_RADIUS = 1;
const NPC_INTERACT_RADIUS = 3;
const TERMINAL_RADIUS = 4;

export function soundCuesForEvents(
  events: readonly GameEvent[],
  context: SoundCueContext,
): readonly SoundCue[] {
  const cues: SoundCue[] = [];
  const cuedEnemyAttacks = new Set<Entity>();
  let playerWeaponCued = false;

  if (context.blockedMove === true) {
    cues.push(cue(SoundId.BlockedMove, context.playerPosition, BLOCKED_MOVE_RADIUS));
  }
  if (context.dialogueTarget !== undefined) {
    cues.push(cue(SoundId.NpcInteract, positionFor(context.dialogueTarget, context), NPC_INTERACT_RADIUS));
  }

  for (const event of events) {
    switch (event.type) {
      case "keyPickedUp":
        cues.push(cue(SoundId.PickupKey, positionFor(event.entity, context), PICKUP_RADIUS));
        break;
      case "uplinkCodePickedUp":
        cues.push(cue(SoundId.PickupUplinkCode, positionFor(event.entity, context), PICKUP_RADIUS));
        break;
      case "spearPickedUp":
        cues.push(cue(SoundId.PickupWeapon, positionFor(event.entity, context), PICKUP_RADIUS));
        break;
      case "weaponPickedUp":
        cues.push(cue(SoundId.PickupWeapon, positionFor(event.entity, context), PICKUP_RADIUS));
        break;
      case "healthPickedUp":
        cues.push(cue(SoundId.PickupHealth, positionFor(event.entity, context), PICKUP_RADIUS));
        break;
      case "ammoPickedUp":
        cues.push(cue(SoundId.PickupAmmo, positionFor(event.entity, context), PICKUP_RADIUS));
        break;
      case "doorLocked":
        cues.push(cue(SoundId.DoorLocked, positionFor(event.entity, context), DOOR_LOCKED_RADIUS));
        break;
      case "doorOpened":
        cues.push(cue(SoundId.DoorOpen, positionFor(event.entity, context), DOOR_OPEN_RADIUS));
        break;
      case "doorShattered":
        cues.push(cue(SoundId.GlassSmash, positionFor(event.entity, context), DOOR_OPEN_RADIUS));
        break;
      case "uplinkTerminalLocked":
        cues.push(cue(SoundId.TerminalLocked, positionFor(event.entity, context), TERMINAL_RADIUS));
        break;
      case "uplinkTerminalNeedsSpear":
        cues.push(cue(SoundId.TerminalLocked, positionFor(event.entity, context), TERMINAL_RADIUS));
        break;
      case "uplinkTerminalActivated":
        cues.push(cue(SoundId.TerminalUse, positionFor(event.entity, context), TERMINAL_RADIUS));
        break;
      case "noAmmo":
        cues.push(cue(SoundId.WeaponNoAmmo, context.playerPosition, 1));
        break;
      case "enemyAlerted": {
        const sounds = context.enemySounds.get(event.entity);
        if (sounds !== undefined) {
          cues.push(cue(sounds.alert, positionFor(event.entity, context), ENEMY_ALERT_RADIUS));
        }
        break;
      }
      case "enemyInvestigating":
        cues.push(
          cue(SoundId.EnemyInvestigate, positionFor(event.entity, context), ENEMY_INVESTIGATE_RADIUS),
        );
        break;
      case "attackMissed":
        playerWeaponCued = cueAttack(cues, event.actor, cuedEnemyAttacks, playerWeaponCued, context);
        break;
      case "damageDealt":
        playerWeaponCued = cueAttack(cues, event.actor, cuedEnemyAttacks, playerWeaponCued, context);
        if (event.target === context.playerEntity) {
          cues.push(cue(SoundId.PlayerHurt, context.playerPosition, PLAYER_HURT_RADIUS));
        } else {
          const targetSounds = context.enemySounds.get(event.target);
          if (targetSounds !== undefined) {
            cues.push(cue(targetSounds.hurt, positionFor(event.target, context), ENEMY_HURT_RADIUS));
          }
        }
        break;
      case "entityDefeated":
        if (event.entity !== context.playerEntity) {
          const sounds = context.enemySounds.get(event.entity);
          if (sounds !== undefined) {
            cues.push(cue(sounds.defeat, positionFor(event.entity, context), ENEMY_DEFEAT_RADIUS));
          }
        }
        break;
      default:
        break;
    }
  }

  return cues;
}

function cueAttack(
  cues: SoundCue[],
  actor: Entity,
  cuedEnemyAttacks: Set<Entity>,
  playerWeaponCued: boolean,
  context: SoundCueContext,
): boolean {
  if (actor === context.playerEntity) {
    if (playerWeaponCued || context.playerWeaponSlot === undefined) return playerWeaponCued;
    cues.push(cue(
      weaponSoundId(context.playerWeaponSlot),
      context.playerPosition,
      context.playerWeaponRadius ?? PICKUP_RADIUS,
    ));
    return true;
  }

  if (!cuedEnemyAttacks.has(actor)) {
    cuedEnemyAttacks.add(actor);
    const sounds = context.enemySounds.get(actor);
    if (sounds !== undefined) {
      cues.push(cue(sounds.attack, positionFor(actor, context), ENEMY_ATTACK_RADIUS));
    }
  }
  return playerWeaponCued;
}

function cue(soundId: SoundId, position: GridPoint, radius: number): SoundCue {
  return { soundId, position: { x: position.x, y: position.y }, radius };
}

function positionFor(entity: Entity, context: SoundCueContext): GridPoint {
  return context.positionsAfter.get(entity) ?? context.positionsBefore.get(entity) ?? context.playerPosition;
}

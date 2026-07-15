import type { EntityDef } from "@/src/game/content/map_entities.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import { createDecoration, createLight, createSound } from "@/src/game/simulation/spawn/ambient.ts";
import { createEnemy, createNpc, createPlayer } from "@/src/game/simulation/spawn/actors.ts";
import {
  createItem,
  createKey,
  createSpearPickup,
  createUplinkCode,
  createWeaponPickup,
} from "@/src/game/simulation/spawn/pickups.ts";
import { createDoor, createSpearTurret, createUplinkTerminal } from "@/src/game/simulation/spawn/structures.ts";
import type { Entity } from "turn-based-engine/ecs";

export function createMapEntity(runtime: GameRuntime, prefab: EntityDef): Entity {
  switch (prefab.prefab) {
    case "player":
      return createPlayer(runtime, prefab);
    case "npc":
      return createNpc(runtime, prefab);
    case "enemy":
      return createEnemy(runtime, prefab);
    case "door":
      return createDoor(runtime, prefab);
    case "key":
      return createKey(runtime, prefab);
    case "uplinkCode":
      return createUplinkCode(runtime, prefab);
    case "uplinkTerminal":
      return createUplinkTerminal(runtime, prefab);
    case "weaponPickup":
      return createWeaponPickup(runtime, prefab);
    case "item":
      return createItem(runtime, prefab);
    case "decoration":
      return createDecoration(runtime, prefab);
    case "light":
      return createLight(runtime, prefab);
    case "sound":
      return createSound(runtime, prefab);
    case "spearPickup":
      return createSpearPickup(runtime, prefab);
    case "spearTurret":
      return createSpearTurret(runtime, prefab);
  }
}

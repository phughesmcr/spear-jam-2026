import type { Entity, World } from "@phughesmcr/miski";
import { Attack, Enemy, Health, Npc } from "@/src/ecs/components.ts";
import type { Player } from "@/src/ecs/player.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import type { CommandSlot } from "@/src/game/state.ts";
import { displayNameText } from "@/src/ecs/names.ts";

type WeaponSpec = {
  readonly label: string;
  readonly range: number;
  readonly damageMultiplier: number;
};

type TileBlocks = (x: number, y: number) => boolean;
type BlockingEntityAt = (x: number, y: number) => Entity | undefined;

export const DEFAULT_SELECTED_WEAPON: CommandSlot = 1;

const PLAYER_WEAPONS: Readonly<Record<CommandSlot, WeaponSpec>> = {
  1: { label: "Melee", range: 1, damageMultiplier: 1 },
  2: { label: "Pistol", range: 2, damageMultiplier: 2 },
  3: { label: "Long-range", range: 6, damageMultiplier: 3 },
};

export function weaponLabel(slot: CommandSlot): string {
  return PLAYER_WEAPONS[slot].label;
}

export function attackWithSelectedWeapon(
  world: World,
  player: Player,
  selectedWeapon: CommandSlot,
  tileBlocks: TileBlocks,
  blockingEntityAt: BlockingEntityAt,
): void {
  const weapon = PLAYER_WEAPONS[selectedWeapon];
  const target = facedEnemyInRange(world, player, weapon.range, tileBlocks, blockingEntityAt);

  if (target === undefined) {
    console.log(`${weapon.label} attack missed.`);
    return;
  }

  attackEntity(
    world,
    player.getEntity(),
    player.getEntity(),
    target,
    attackDamage(world, player.getEntity()) * weapon.damageMultiplier,
  );
}

export function attackEntity(
  world: World,
  playerEntity: Entity,
  attacker: Entity,
  defender: Entity,
  damage: number,
): void {
  if (!world.entities.isActive(defender)) return;
  if (!world.components.entityHas(Health, defender)) return;

  const health = world.components.getEntityData(Health, defender);
  const nextHealth = Math.max(0, health.current - damage);
  world.components.setEntityData(Health, defender, { current: nextHealth, max: health.max });
  console.log(
    `${entityName(world, playerEntity, attacker)} hit ${entityName(world, playerEntity, defender)} for ${damage}.`,
  );

  if (nextHealth > 0) return;

  if (defender === playerEntity) {
    console.log("You are defeated.");
    return;
  }

  console.log(`${entityName(world, playerEntity, defender)} is defeated.`);
  world.entities.destroy(defender);
}

export function attackDamage(world: World, entity: Entity): number {
  if (!world.components.entityHas(Attack, entity)) return 0;
  return world.components.getEntityData(Attack, entity).damage;
}

function facedEnemyInRange(
  world: World,
  player: Player,
  range: number,
  tileBlocks: TileBlocks,
  blockingEntityAt: BlockingEntityAt,
): Entity | undefined {
  const current = player.getPosition();
  const { dir } = player.getFacing();
  const delta = directionDelta(dir);

  for (let distance = 1; distance <= range; distance++) {
    const x = current.x + delta.dx * distance;
    const y = current.y + delta.dy * distance;
    if (tileBlocks(x, y)) return undefined;

    const entity = blockingEntityAt(x, y);
    if (entity === undefined) continue;
    if (world.components.entityHas(Enemy, entity)) return entity;
    return undefined;
  }

  return undefined;
}

function entityName(world: World, playerEntity: Entity, entity: Entity): string {
  if (entity === playerEntity) return "You";
  if (world.components.entityHas(Npc, entity)) {
    return displayNameText(world.components.getEntityData(Npc, entity).displayName);
  }
  return "Something";
}

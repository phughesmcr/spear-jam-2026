/**
 * Stable numeric sprite identities for ECS `Sprite` storage and appearance tables.
 * Codes are fixed; only append new ids at the end.
 */
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
  Spear: 25,
  MainframeCore: 26,
  SpearTurret: 27,
  SpearTurretLoaded: 28,
} as const;
export type SpriteId = (typeof SpriteId)[keyof typeof SpriteId];

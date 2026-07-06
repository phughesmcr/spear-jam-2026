import { SoundId, type SoundId as SoundIdType } from "@/src/game/sound.ts";

export type SoundCategory = "ambient" | "music" | "sfx";

export type SoundCatalogEntry = {
  readonly soundId: SoundIdType;
  readonly src: string;
  readonly category: SoundCategory;
  readonly volume: number;
  readonly radius: number;
  readonly loop: boolean;
};

const MUSIC_MAIN = new URL("../../assets/game/audio/music_main.wav", import.meta.url).href;
const BLOCKED_MOVE = new URL("../../assets/game/audio/blocked_move.wav", import.meta.url).href;
const DOOR_OPEN = new URL("../../assets/game/audio/door_open.wav", import.meta.url).href;
const DOOR_LOCKED = new URL("../../assets/game/audio/door_locked.wav", import.meta.url).href;
const PICKUP_ITEM = new URL("../../assets/game/audio/pickup_item.wav", import.meta.url).href;
const PICKUP_KEY = new URL("../../assets/game/audio/pickup_key.wav", import.meta.url).href;
const PICKUP_WEAPON = new URL("../../assets/game/audio/pickup_weapon.wav", import.meta.url).href;
const PICKUP_HEALTH = new URL("../../assets/game/audio/pickup_health.wav", import.meta.url).href;
const PICKUP_AMMO = new URL("../../assets/game/audio/pickup_ammo.wav", import.meta.url).href;
const PICKUP_UPLINK_CODE = new URL("../../assets/game/audio/pickup_uplink_code.wav", import.meta.url).href;
const WEAPON_BIT_SHIFTER = new URL("../../assets/game/audio/weapon_bit_shifter.wav", import.meta.url).href;
const WEAPON_PULSE_PISTOL = new URL("../../assets/game/audio/weapon_pulse_pistol.wav", import.meta.url).href;
const WEAPON_CURRENT_CANNON = new URL("../../assets/game/audio/weapon_current_cannon.wav", import.meta.url).href;
const WEAPON_NO_AMMO = new URL("../../assets/game/audio/weapon_no_ammo.wav", import.meta.url).href;
const ENEMY_IDLE = new URL("../../assets/game/audio/enemy_idle.wav", import.meta.url).href;
const ENEMY_ATTACK = new URL("../../assets/game/audio/enemy_attack.wav", import.meta.url).href;
const ENEMY_DEFEAT = new URL("../../assets/game/audio/enemy_defeat.wav", import.meta.url).href;
const PLAYER_HURT = new URL("../../assets/game/audio/player_hurt.wav", import.meta.url).href;
const NPC_INTERACT = new URL("../../assets/game/audio/npc_interact.wav", import.meta.url).href;
const TERMINAL_LOCKED = new URL("../../assets/game/audio/terminal_locked.wav", import.meta.url).href;
const TERMINAL_USE = new URL("../../assets/game/audio/terminal_use.wav", import.meta.url).href;
const AMBIENT_HUM = new URL("../../assets/game/audio/ambient_hum.wav", import.meta.url).href;
const AMBIENT_LIGHT_BUZZ = new URL("../../assets/game/audio/ambient_light_buzz.wav", import.meta.url).href;

export const SOUND_CATALOG: Readonly<Record<SoundIdType, SoundCatalogEntry>> = {
  [SoundId.MusicMain]: music(SoundId.MusicMain, MUSIC_MAIN, 0.55),
  [SoundId.BlockedMove]: sfx(SoundId.BlockedMove, BLOCKED_MOVE, 0.45, 2),
  [SoundId.DoorOpen]: sfx(SoundId.DoorOpen, DOOR_OPEN, 0.75, 5),
  [SoundId.DoorLocked]: sfx(SoundId.DoorLocked, DOOR_LOCKED, 0.65, 3),
  [SoundId.PickupItem]: sfx(SoundId.PickupItem, PICKUP_ITEM, 0.55, 3),
  [SoundId.PickupKey]: sfx(SoundId.PickupKey, PICKUP_KEY, 0.65, 3),
  [SoundId.PickupWeapon]: sfx(SoundId.PickupWeapon, PICKUP_WEAPON, 0.7, 3),
  [SoundId.PickupHealth]: sfx(SoundId.PickupHealth, PICKUP_HEALTH, 0.6, 3),
  [SoundId.PickupAmmo]: sfx(SoundId.PickupAmmo, PICKUP_AMMO, 0.55, 3),
  [SoundId.PickupUplinkCode]: sfx(SoundId.PickupUplinkCode, PICKUP_UPLINK_CODE, 0.65, 3),
  [SoundId.WeaponBitShifter]: sfx(SoundId.WeaponBitShifter, WEAPON_BIT_SHIFTER, 0.65, 4),
  [SoundId.WeaponPulsePistol]: sfx(SoundId.WeaponPulsePistol, WEAPON_PULSE_PISTOL, 0.72, 8),
  [SoundId.WeaponCurrentCannon]: sfx(SoundId.WeaponCurrentCannon, WEAPON_CURRENT_CANNON, 0.82, 8),
  [SoundId.WeaponNoAmmo]: sfx(SoundId.WeaponNoAmmo, WEAPON_NO_AMMO, 0.5, 1),
  [SoundId.EnemyIdle]: sfx(SoundId.EnemyIdle, ENEMY_IDLE, 0.42, 5),
  [SoundId.EnemyAttack]: sfx(SoundId.EnemyAttack, ENEMY_ATTACK, 0.7, 5),
  [SoundId.EnemyDefeat]: sfx(SoundId.EnemyDefeat, ENEMY_DEFEAT, 0.7, 5),
  [SoundId.PlayerHurt]: sfx(SoundId.PlayerHurt, PLAYER_HURT, 0.7, 1),
  [SoundId.NpcInteract]: sfx(SoundId.NpcInteract, NPC_INTERACT, 0.55, 3),
  [SoundId.TerminalLocked]: sfx(SoundId.TerminalLocked, TERMINAL_LOCKED, 0.55, 4),
  [SoundId.TerminalUse]: sfx(SoundId.TerminalUse, TERMINAL_USE, 0.7, 4),
  [SoundId.AmbientHum]: ambient(SoundId.AmbientHum, AMBIENT_HUM, 0.38, 7),
  [SoundId.AmbientLightBuzz]: ambient(SoundId.AmbientLightBuzz, AMBIENT_LIGHT_BUZZ, 0.3, 4),
};

export function soundCatalogEntry(soundId: SoundIdType): SoundCatalogEntry {
  return SOUND_CATALOG[soundId];
}

function music(soundId: SoundIdType, src: string, volume: number): SoundCatalogEntry {
  return { soundId, src, category: "music", volume, radius: 0, loop: true };
}

function sfx(soundId: SoundIdType, src: string, volume: number, radius: number): SoundCatalogEntry {
  return { soundId, src, category: "sfx", volume, radius, loop: false };
}

function ambient(soundId: SoundIdType, src: string, volume: number, radius: number): SoundCatalogEntry {
  return { soundId, src, category: "ambient", volume, radius, loop: true };
}

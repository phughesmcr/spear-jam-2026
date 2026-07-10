import { SoundId, type SoundId as SoundIdType } from "@/src/game/sound.ts";

export type SoundCategory = "ambient" | "sfx";

export type SoundCatalogEntry = {
  readonly soundId: SoundIdType;
  readonly src: string;
  readonly category: SoundCategory;
  readonly volume: number;
  readonly radius: number;
  readonly loop: boolean;
};

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
const PLAYER_HURT = new URL("../../assets/game/audio/player_hurt.wav", import.meta.url).href;
const NPC_INTERACT = new URL("../../assets/game/audio/npc_interact.wav", import.meta.url).href;
const TERMINAL_LOCKED = new URL("../../assets/game/audio/terminal_locked.wav", import.meta.url).href;
const TERMINAL_USE = new URL("../../assets/game/audio/terminal_use.wav", import.meta.url).href;
const AMBIENT_HUM = new URL("../../assets/game/audio/ambient_hum.wav", import.meta.url).href;
const AMBIENT_LIGHT_BUZZ = new URL("../../assets/game/audio/ambient_light_buzz.wav", import.meta.url).href;
const ENEMY_INVESTIGATE = new URL("../../assets/game/audio/enemy_investigate.wav", import.meta.url).href;
const DOG_IDLE = new URL("../../assets/game/audio/dog_idle.wav", import.meta.url).href;
const DOG_ALERT = new URL("../../assets/game/audio/dog_alert.wav", import.meta.url).href;
const DOG_ATTACK = new URL("../../assets/game/audio/dog_attack.wav", import.meta.url).href;
const DOG_HURT = new URL("../../assets/game/audio/dog_hurt.wav", import.meta.url).href;
const DOG_DEFEAT = new URL("../../assets/game/audio/dog_defeat.wav", import.meta.url).href;
const GUNSLINGER_IDLE = new URL("../../assets/game/audio/gunslinger_idle.wav", import.meta.url).href;
const GUNSLINGER_ALERT = new URL("../../assets/game/audio/gunslinger_alert.wav", import.meta.url).href;
const GUNSLINGER_ATTACK = new URL("../../assets/game/audio/gunslinger_attack.wav", import.meta.url).href;
const GUNSLINGER_HURT = new URL("../../assets/game/audio/gunslinger_hurt.wav", import.meta.url).href;
const GUNSLINGER_DEFEAT = new URL("../../assets/game/audio/gunslinger_defeat.wav", import.meta.url).href;
const NEOPHYTE_IDLE = new URL("../../assets/game/audio/neophyte_idle.wav", import.meta.url).href;
const NEOPHYTE_ALERT = new URL("../../assets/game/audio/neophyte_alert.wav", import.meta.url).href;
const NEOPHYTE_ATTACK = new URL("../../assets/game/audio/neophyte_attack.wav", import.meta.url).href;
const NEOPHYTE_HURT = new URL("../../assets/game/audio/neophyte_hurt.wav", import.meta.url).href;
const NEOPHYTE_DEFEAT = new URL("../../assets/game/audio/neophyte_defeat.wav", import.meta.url).href;
const SENTINEL_IDLE = new URL("../../assets/game/audio/sentinel_idle.wav", import.meta.url).href;
const SENTINEL_ALERT = new URL("../../assets/game/audio/sentinel_alert.wav", import.meta.url).href;
const SENTINEL_ATTACK = new URL("../../assets/game/audio/sentinel_attack.wav", import.meta.url).href;
const SENTINEL_HURT = new URL("../../assets/game/audio/sentinel_hurt.wav", import.meta.url).href;
const SENTINEL_DEFEAT = new URL("../../assets/game/audio/sentinel_defeat.wav", import.meta.url).href;
const ACOLYTE_IDLE = new URL("../../assets/game/audio/acolyte_idle.wav", import.meta.url).href;
const ACOLYTE_ALERT = new URL("../../assets/game/audio/acolyte_alert.wav", import.meta.url).href;
const ACOLYTE_ATTACK = new URL("../../assets/game/audio/acolyte_attack.wav", import.meta.url).href;
const ACOLYTE_HURT = new URL("../../assets/game/audio/acolyte_hurt.wav", import.meta.url).href;
const ACOLYTE_DEFEAT = new URL("../../assets/game/audio/acolyte_defeat.wav", import.meta.url).href;

export const SOUND_CATALOG: Readonly<Record<SoundIdType, SoundCatalogEntry>> = {
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
  [SoundId.PlayerHurt]: sfx(SoundId.PlayerHurt, PLAYER_HURT, 0.7, 1),
  [SoundId.NpcInteract]: sfx(SoundId.NpcInteract, NPC_INTERACT, 0.55, 3),
  [SoundId.TerminalLocked]: sfx(SoundId.TerminalLocked, TERMINAL_LOCKED, 0.55, 4),
  [SoundId.TerminalUse]: sfx(SoundId.TerminalUse, TERMINAL_USE, 0.7, 4),
  [SoundId.AmbientHum]: ambient(SoundId.AmbientHum, AMBIENT_HUM, 0.38, 7),
  [SoundId.AmbientLightBuzz]: ambient(SoundId.AmbientLightBuzz, AMBIENT_LIGHT_BUZZ, 0.3, 4),
  [SoundId.EnemyInvestigate]: sfx(SoundId.EnemyInvestigate, ENEMY_INVESTIGATE, 0.45, 4),
  [SoundId.DogIdle]: sfx(SoundId.DogIdle, DOG_IDLE, 0.42, 5),
  [SoundId.DogAlert]: sfx(SoundId.DogAlert, DOG_ALERT, 0.65, 6),
  [SoundId.DogAttack]: sfx(SoundId.DogAttack, DOG_ATTACK, 0.7, 5),
  [SoundId.DogHurt]: sfx(SoundId.DogHurt, DOG_HURT, 0.65, 4),
  [SoundId.DogDefeat]: sfx(SoundId.DogDefeat, DOG_DEFEAT, 0.7, 5),
  [SoundId.GunslingerIdle]: sfx(SoundId.GunslingerIdle, GUNSLINGER_IDLE, 0.4, 5),
  [SoundId.GunslingerAlert]: sfx(SoundId.GunslingerAlert, GUNSLINGER_ALERT, 0.55, 6),
  [SoundId.GunslingerAttack]: sfx(SoundId.GunslingerAttack, GUNSLINGER_ATTACK, 0.72, 8),
  [SoundId.GunslingerHurt]: sfx(SoundId.GunslingerHurt, GUNSLINGER_HURT, 0.6, 4),
  [SoundId.GunslingerDefeat]: sfx(SoundId.GunslingerDefeat, GUNSLINGER_DEFEAT, 0.7, 5),
  [SoundId.NeophyteIdle]: sfx(SoundId.NeophyteIdle, NEOPHYTE_IDLE, 0.38, 5),
  [SoundId.NeophyteAlert]: sfx(SoundId.NeophyteAlert, NEOPHYTE_ALERT, 0.55, 6),
  [SoundId.NeophyteAttack]: sfx(SoundId.NeophyteAttack, NEOPHYTE_ATTACK, 0.65, 7),
  [SoundId.NeophyteHurt]: sfx(SoundId.NeophyteHurt, NEOPHYTE_HURT, 0.55, 4),
  [SoundId.NeophyteDefeat]: sfx(SoundId.NeophyteDefeat, NEOPHYTE_DEFEAT, 0.65, 5),
  [SoundId.SentinelIdle]: sfx(SoundId.SentinelIdle, SENTINEL_IDLE, 0.35, 4),
  [SoundId.SentinelAlert]: sfx(SoundId.SentinelAlert, SENTINEL_ALERT, 0.55, 5),
  [SoundId.SentinelAttack]: sfx(SoundId.SentinelAttack, SENTINEL_ATTACK, 0.75, 5),
  [SoundId.SentinelHurt]: sfx(SoundId.SentinelHurt, SENTINEL_HURT, 0.6, 4),
  [SoundId.SentinelDefeat]: sfx(SoundId.SentinelDefeat, SENTINEL_DEFEAT, 0.7, 5),
  [SoundId.AcolyteIdle]: sfx(SoundId.AcolyteIdle, ACOLYTE_IDLE, 0.4, 5),
  [SoundId.AcolyteAlert]: sfx(SoundId.AcolyteAlert, ACOLYTE_ALERT, 0.6, 6),
  [SoundId.AcolyteAttack]: sfx(SoundId.AcolyteAttack, ACOLYTE_ATTACK, 0.75, 7),
  [SoundId.AcolyteHurt]: sfx(SoundId.AcolyteHurt, ACOLYTE_HURT, 0.6, 4),
  [SoundId.AcolyteDefeat]: sfx(SoundId.AcolyteDefeat, ACOLYTE_DEFEAT, 0.7, 5),
};

export function soundCatalogEntry(soundId: SoundIdType): SoundCatalogEntry {
  return SOUND_CATALOG[soundId];
}

function sfx(soundId: SoundIdType, src: string, volume: number, radius: number): SoundCatalogEntry {
  return { soundId, src, category: "sfx", volume, radius, loop: false };
}

function ambient(soundId: SoundIdType, src: string, volume: number, radius: number): SoundCatalogEntry {
  return { soundId, src, category: "ambient", volume, radius, loop: true };
}

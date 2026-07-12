import { MUSIC_TRACKS } from "@/src/audio/music_catalog.ts";
import { SOUND_CATALOG } from "@/src/audio/sound_catalog.ts";
import { VOICE_CATALOG } from "@/src/dialogue/voice.ts";
import { SOUND_IDS, SoundId, type SoundId as SoundIdType } from "@/src/game/sound.ts";

type WaveSpec = {
  readonly durationSeconds: number;
  readonly frequency: number;
  readonly volume: number;
  readonly kind: "noise" | "sine" | "square" | "sweep";
};

const SAMPLE_RATE = 22_050;
const OUTPUT_DIR = "assets/game/audio";
const ASSET_SPECS: Readonly<Record<SoundIdType, WaveSpec>> = {
  [SoundId.BlockedMove]: { durationSeconds: 0.12, frequency: 90, volume: 0.45, kind: "noise" },
  [SoundId.DoorOpen]: { durationSeconds: 0.45, frequency: 130, volume: 0.5, kind: "sweep" },
  [SoundId.DoorLocked]: { durationSeconds: 0.18, frequency: 180, volume: 0.42, kind: "square" },
  [SoundId.GlassSmash]: { durationSeconds: 0.35, frequency: 400, volume: 0.55, kind: "noise" },
  [SoundId.PickupItem]: { durationSeconds: 0.18, frequency: 660, volume: 0.38, kind: "sine" },
  [SoundId.PickupKey]: { durationSeconds: 0.24, frequency: 880, volume: 0.38, kind: "sine" },
  [SoundId.PickupWeapon]: { durationSeconds: 0.28, frequency: 520, volume: 0.42, kind: "sweep" },
  [SoundId.PickupHealth]: { durationSeconds: 0.25, frequency: 740, volume: 0.38, kind: "sine" },
  [SoundId.PickupAmmo]: { durationSeconds: 0.16, frequency: 570, volume: 0.35, kind: "square" },
  [SoundId.PickupUplinkCode]: { durationSeconds: 0.32, frequency: 990, volume: 0.34, kind: "sweep" },
  [SoundId.WeaponBitShifter]: { durationSeconds: 0.16, frequency: 150, volume: 0.5, kind: "noise" },
  [SoundId.WeaponPulsePistol]: { durationSeconds: 0.18, frequency: 330, volume: 0.55, kind: "square" },
  [SoundId.WeaponCurrentCannon]: { durationSeconds: 0.34, frequency: 180, volume: 0.6, kind: "sweep" },
  [SoundId.WeaponNoAmmo]: { durationSeconds: 0.12, frequency: 220, volume: 0.32, kind: "square" },
  [SoundId.PlayerHurt]: { durationSeconds: 0.24, frequency: 120, volume: 0.5, kind: "noise" },
  [SoundId.NpcInteract]: { durationSeconds: 0.22, frequency: 440, volume: 0.35, kind: "sine" },
  [SoundId.TerminalLocked]: { durationSeconds: 0.2, frequency: 260, volume: 0.35, kind: "square" },
  [SoundId.TerminalUse]: { durationSeconds: 0.4, frequency: 620, volume: 0.4, kind: "sweep" },
  [SoundId.AmbientHum]: { durationSeconds: 2, frequency: 85, volume: 0.24, kind: "sine" },
  [SoundId.AmbientLightBuzz]: { durationSeconds: 1.5, frequency: 120, volume: 0.2, kind: "noise" },
  [SoundId.AmbientWind]: { durationSeconds: 2, frequency: 70, volume: 0.2, kind: "noise" },
  [SoundId.EnemyInvestigate]: { durationSeconds: 0.13, frequency: 880, volume: 0.3, kind: "sine" },
  [SoundId.DogIdle]: { durationSeconds: 0.4, frequency: 180, volume: 0.35, kind: "noise" },
  [SoundId.DogAlert]: { durationSeconds: 0.35, frequency: 220, volume: 0.4, kind: "square" },
  [SoundId.DogAttack]: { durationSeconds: 0.28, frequency: 140, volume: 0.5, kind: "noise" },
  [SoundId.DogHurt]: { durationSeconds: 0.3, frequency: 160, volume: 0.45, kind: "noise" },
  [SoundId.DogDefeat]: { durationSeconds: 0.45, frequency: 110, volume: 0.5, kind: "sweep" },
  [SoundId.GunslingerIdle]: { durationSeconds: 0.45, frequency: 240, volume: 0.32, kind: "sine" },
  [SoundId.GunslingerAlert]: { durationSeconds: 0.22, frequency: 660, volume: 0.35, kind: "square" },
  [SoundId.GunslingerAttack]: { durationSeconds: 0.35, frequency: 380, volume: 0.55, kind: "square" },
  [SoundId.GunslingerHurt]: { durationSeconds: 0.3, frequency: 200, volume: 0.45, kind: "noise" },
  [SoundId.GunslingerDefeat]: { durationSeconds: 0.5, frequency: 140, volume: 0.5, kind: "sweep" },
  [SoundId.NeophyteIdle]: { durationSeconds: 0.35, frequency: 520, volume: 0.3, kind: "sine" },
  [SoundId.NeophyteAlert]: { durationSeconds: 0.28, frequency: 740, volume: 0.35, kind: "square" },
  [SoundId.NeophyteAttack]: { durationSeconds: 0.32, frequency: 440, volume: 0.5, kind: "square" },
  [SoundId.NeophyteHurt]: { durationSeconds: 0.28, frequency: 260, volume: 0.4, kind: "noise" },
  [SoundId.NeophyteDefeat]: { durationSeconds: 0.42, frequency: 180, volume: 0.45, kind: "sweep" },
  [SoundId.SentinelIdle]: { durationSeconds: 2, frequency: 90, volume: 0.28, kind: "sine" },
  [SoundId.SentinelAlert]: { durationSeconds: 0.2, frequency: 990, volume: 0.35, kind: "square" },
  [SoundId.SentinelAttack]: { durationSeconds: 0.4, frequency: 120, volume: 0.55, kind: "noise" },
  [SoundId.SentinelHurt]: { durationSeconds: 0.35, frequency: 150, volume: 0.45, kind: "noise" },
  [SoundId.SentinelDefeat]: { durationSeconds: 1.2, frequency: 80, volume: 0.45, kind: "sweep" },
  [SoundId.AcolyteIdle]: { durationSeconds: 0.45, frequency: 300, volume: 0.32, kind: "sine" },
  [SoundId.AcolyteAlert]: { durationSeconds: 0.3, frequency: 560, volume: 0.4, kind: "square" },
  [SoundId.AcolyteAttack]: { durationSeconds: 0.5, frequency: 200, volume: 0.55, kind: "sweep" },
  [SoundId.AcolyteHurt]: { durationSeconds: 0.3, frequency: 220, volume: 0.45, kind: "noise" },
  [SoundId.AcolyteDefeat]: { durationSeconds: 0.48, frequency: 130, volume: 0.5, kind: "sweep" },
};

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  });
}

export async function main(args: readonly string[] = Deno.args): Promise<void> {
  const command = args[0] ?? "generate";
  switch (command) {
    case "generate":
      await generateAudioAssets();
      return;
    case "check":
      await checkAudioAssets();
      return;
    default:
      throw new Error("Usage: deno run -A scripts/audio_assets.ts generate|check");
  }
}

export async function generateAudioAssets(): Promise<void> {
  await Deno.mkdir(OUTPUT_DIR, { recursive: true });
  for (const soundId of SOUND_IDS) {
    if (await assetExists(SOUND_CATALOG[soundId].src) || await pathExists(assetPath(soundId))) continue;
    await Deno.writeFile(assetPath(soundId), waveBytes(ASSET_SPECS[soundId], soundId));
  }
}

export async function checkAudioAssets(): Promise<void> {
  const issues: string[] = [];
  for (const soundId of SOUND_IDS) {
    const src = SOUND_CATALOG[soundId].src;
    if (await assetExists(src)) continue;
    issues.push(`${src} is missing for ${soundId}. Run deno task audio:generate.`);
  }
  for (const [trackId, track] of Object.entries(MUSIC_TRACKS)) {
    if (await assetExists(track.src)) continue;
    issues.push(`Music track ${trackId} is missing: ${track.src}`);
  }
  for (const [voiceId, src] of Object.entries(VOICE_CATALOG)) {
    if (await assetExists(src)) continue;
    issues.push(`Dialogue voice ${voiceId} is missing: ${src}`);
  }
  if (issues.length > 0) throw new Error(`Audio asset check failed:\n${issues.join("\n")}`);
}

async function assetExists(src: string): Promise<boolean> {
  try {
    await Deno.lstat(new URL(src));
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return false;
    throw error;
  }
}

function assetPath(soundId: SoundIdType): string {
  return `${OUTPUT_DIR}/${snakeCase(soundId)}.wav`;
}

function waveBytes(spec: WaveSpec, soundId: SoundIdType): Uint8Array {
  const sampleCount = Math.max(1, Math.floor(spec.durationSeconds * SAMPLE_RATE));
  const dataBytes = sampleCount * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);

  writeAscii(bytes, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(bytes, 8, "WAVE");
  writeAscii(bytes, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, "data");
  view.setUint32(40, dataBytes, true);

  const seed = hashString(soundId);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / SAMPLE_RATE;
    const progress = i / sampleCount;
    const envelope = Math.sin(Math.PI * progress);
    const sample = sampleValue(spec, t, progress, seed + i) * spec.volume * envelope;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }

  return bytes;
}

function sampleValue(spec: WaveSpec, t: number, progress: number, seed: number): number {
  switch (spec.kind) {
    case "sine":
      return Math.sin(Math.PI * 2 * spec.frequency * t) * 0.8 + Math.sin(Math.PI * 4 * spec.frequency * t) * 0.2;
    case "square":
      return Math.sin(Math.PI * 2 * spec.frequency * t) >= 0 ? 0.8 : -0.8;
    case "sweep": {
      const frequency = spec.frequency * (1 + progress * 2);
      return Math.sin(Math.PI * 2 * frequency * t) * (1 - progress * 0.35);
    }
    case "noise":
      return pseudoRandom(seed) * 2 - 1;
  }
}

function writeAscii(bytes: Uint8Array, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudoRandom(seed: number): number {
  let value = seed >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0xffffffff;
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

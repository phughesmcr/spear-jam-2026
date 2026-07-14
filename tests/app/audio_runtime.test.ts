import { createAudioRuntime } from "@/src/app/audio_runtime.ts";
import type {
  AudioClip,
  AudioCue,
  AudioEmitter,
  AudioRuntime,
  AudioTrack,
  IdleAudioSource,
  ListenerPose,
} from "@/src/engine/audio/mod.ts";
import { TrackId } from "@/src/game/content/audio/music.ts";
import { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import { type EnemyIdleSoundSource, type SoundEmitterSnapshot, SoundId } from "@/src/game/model/sound.ts";
import { createGameModel } from "@/src/game/model/transition/mod.ts";
import {
  audioCuesFor,
  audioEmitterFor,
  audioTrackFor,
  audioVoiceFor,
  idleAudioSourceFor,
  listenerPoseFor,
} from "@/src/game/presentation/audio.ts";
import type { AudioWorldSession } from "@/src/game/presentation/session_view.ts";
import { Direction } from "@/src/game/world/direction.ts";
import { assertEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

const EMITTER = 2 as Entity;

Deno.test("audio runtime world sync clears stale emitters when the session disappears", () => {
  const audio = new FakeAudioRuntime();
  let session: AudioWorldSession | undefined = fakeAudioSession();
  const runtime = createAudioRuntime({
    host: {} as Window,
    getSession: () => session,
    audio,
  });

  runtime.syncWorld();
  assertEquals(audio.ambientEmitters, [audioEmitterFor(ambientEmitter())]);
  assertEquals(audio.idleSources, [idleAudioSourceFor(enemyIdleSource())]);

  session = undefined;
  runtime.syncWorld();
  assertEquals(audio.ambientEmitters, []);
  assertEquals(audio.idleSources, []);
});

Deno.test("audio runtime updateListener uses the current session pose", () => {
  const audio = new FakeAudioRuntime();
  const runtime = createAudioRuntime({
    host: {} as Window,
    getSession: () => fakeAudioSession(),
    audio,
  });

  runtime.updateListener();

  assertEquals(audio.listenerPose, listenerPoseFor({ x: 3, y: 4 }, 1));
});

Deno.test("audio runtime forwards the selected music track", () => {
  const audio = new FakeAudioRuntime();
  const runtime = createAudioRuntime({ host: {} as Window, getSession: () => undefined, audio });

  runtime.playMusic(TrackId.Map3);

  assertEquals(audio.musicTrack, audioTrackFor(TrackId.Map3));
});

Deno.test("audio runtime forwards dialogue voice changes", () => {
  const audio = new FakeAudioRuntime();
  const runtime = createAudioRuntime({ host: {} as Window, getSession: () => undefined, audio });

  runtime.setDialogueVoice(VoiceId.JohnNexusGreet);
  assertEquals(audio.voice, audioVoiceFor(VoiceId.JohnNexusGreet));

  runtime.setDialogueVoice(undefined);
  assertEquals(audio.voice, undefined);
});

Deno.test("audio runtime owns unlock, volume, cue, stop, and disposal lifecycle", async () => {
  const audio = new FakeAudioRuntime();
  const runtime = createAudioRuntime({ host: {} as Window, getSession: () => undefined, audio });
  const model = createGameModel("Level 1");
  const cues = [{ soundId: SoundId.BlockedMove }] as const;

  await runtime.unlock();
  runtime.setVolumes(model.audio);
  runtime.playCues(cues);

  assertEquals(audio.unlocks, 1);
  assertEquals(audio.volumes, model.audio);
  assertEquals(audio.cues, audioCuesFor(cues));

  runtime.stopSounds();
  assertEquals(audio.cues, []);
  runtime[Symbol.dispose]();
  assertEquals(audio.disposed, true);
});

function fakeAudioSession(): AudioWorldSession {
  return {
    getPlayerPosition: () => ({ x: 3, y: 4 }),
    getPlayerFacing: () => ({ dir: Direction.East }),
    forEachSoundEmitter(visit: (emitter: SoundEmitterSnapshot) => void): void {
      visit(ambientEmitter());
    },
    forEachEnemyIdleSoundSource(visit: (source: EnemyIdleSoundSource) => void): void {
      visit(enemyIdleSource());
    },
  };
}

function ambientEmitter(): SoundEmitterSnapshot {
  return {
    entity: EMITTER,
    soundId: SoundId.AmbientHum,
    x: 5,
    y: 6,
    radius: 7,
    volume: 0.8,
  };
}

function enemyIdleSource(): EnemyIdleSoundSource {
  return {
    entity: EMITTER,
    soundId: SoundId.DogIdle,
    x: 5,
    y: 6,
    radius: 7,
    volume: 0.8,
    minDelayMs: 100,
    maxDelayMs: 200,
  };
}

class FakeAudioRuntime implements AudioRuntime {
  disposed = false;
  listenerPose?: ListenerPose;
  ambientEmitters: readonly AudioEmitter[] = [];
  idleSources: readonly IdleAudioSource[] = [];
  cues: readonly AudioCue[] = [];
  musicTrack?: AudioTrack;
  voice?: AudioClip;
  unlocks = 0;
  volumes?: { readonly musicVolume: number; readonly soundVolume: number };

  unlock(): Promise<void> {
    this.unlocks++;
    return Promise.resolve();
  }

  playMusic(track: AudioTrack): void {
    this.musicTrack = track;
  }

  stopSounds(): void {
    this.cues = [];
    this.voice = undefined;
    this.ambientEmitters = [];
    this.idleSources = [];
  }

  setVolumes(volumes: { readonly musicVolume: number; readonly soundVolume: number }): void {
    this.volumes = { ...volumes };
  }

  updateListener(pose: ListenerPose): void {
    this.listenerPose = pose;
  }

  playCues(cues: readonly AudioCue[]): void {
    this.cues = [...cues];
  }

  setVoice(voice: AudioClip | undefined): void {
    this.voice = voice;
  }

  syncAmbientEmitters(emitters: readonly AudioEmitter[]): void {
    this.ambientEmitters = emitters.map((emitter) => ({ ...emitter }));
  }

  syncIdleSources(sources: readonly IdleAudioSource[]): void {
    this.idleSources = sources.map((source) => ({ ...source }));
  }

  [Symbol.dispose](): void {
    this.disposed = true;
  }
}

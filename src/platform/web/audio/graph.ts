import type { AudioPoint, AudioVolumes, ListenerPose } from "@/src/engine/audio/mod.ts";
import { pointDistance, soundAttenuationForDistance } from "@/src/platform/web/audio/spatial.ts";

export type AudioGraphNodes = {
  readonly context: AudioContext;
  readonly masterGain: GainNode;
  readonly musicGain: GainNode;
  readonly sfxGain: GainNode;
  readonly ambientGain: GainNode;
};

export type AudioGraph = {
  nodes(): AudioGraphNodes;
  setVolumes(volumes: AudioVolumes): void;
  updateListener(pose: ListenerPose): void;
  attenuationFor(position: AudioPoint, radius: number): number;
  dispose(): void;
};

type AudioContextConstructor = new () => AudioContext;
type WindowWithAudioContext = Window & {
  readonly AudioContext: AudioContextConstructor;
};

export function createAudioGraph(host: Window): AudioGraph {
  let graph: AudioGraphNodes | undefined;
  let listenerPosition: AudioPoint | undefined;
  let musicVolume = 1;
  let soundVolume = 1;

  function nodes(): AudioGraphNodes {
    if (graph !== undefined) return graph;

    const AudioContext = (host as WindowWithAudioContext).AudioContext;
    const context = new AudioContext();
    const masterGain = context.createGain();
    const musicGain = context.createGain();
    const sfxGain = context.createGain();
    const ambientGain = context.createGain();
    setAudioParam(masterGain.gain, 1, context.currentTime);
    setAudioParam(musicGain.gain, musicVolume, context.currentTime);
    setAudioParam(sfxGain.gain, soundVolume, context.currentTime);
    setAudioParam(ambientGain.gain, soundVolume, context.currentTime);
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    ambientGain.connect(masterGain);
    masterGain.connect(context.destination);
    graph = { context, masterGain, musicGain, sfxGain, ambientGain };
    return graph;
  }

  function setVolumes(volumes: AudioVolumes): void {
    musicVolume = clampVolume(volumes.musicVolume);
    soundVolume = clampVolume(volumes.soundVolume);
    if (graph === undefined) return;
    const now = graph.context.currentTime;
    setAudioParam(graph.musicGain.gain, musicVolume, now);
    setAudioParam(graph.sfxGain.gain, soundVolume, now);
    setAudioParam(graph.ambientGain.gain, soundVolume, now);
  }

  function updateListener(pose: ListenerPose): void {
    listenerPosition = copyPoint(pose.position);
    if (graph === undefined) return;
    const listener = graph.context.listener;
    setAudioParam(listener.positionX, pose.position.x, graph.context.currentTime);
    setAudioParam(listener.positionY, pose.position.y, graph.context.currentTime);
    setAudioParam(listener.positionZ, pose.position.z, graph.context.currentTime);
    setAudioParam(listener.forwardX, pose.forward.x, graph.context.currentTime);
    setAudioParam(listener.forwardY, pose.forward.y, graph.context.currentTime);
    setAudioParam(listener.forwardZ, pose.forward.z, graph.context.currentTime);
    setAudioParam(listener.upX, pose.up.x, graph.context.currentTime);
    setAudioParam(listener.upY, pose.up.y, graph.context.currentTime);
    setAudioParam(listener.upZ, pose.up.z, graph.context.currentTime);
  }

  function attenuationFor(position: AudioPoint, radius: number): number {
    if (listenerPosition === undefined) return 1;
    return soundAttenuationForDistance(pointDistance(listenerPosition, position), radius);
  }

  function dispose(): void {
    if (graph !== undefined && graph.context.state !== "closed") void graph.context.close();
  }

  return { nodes, setVolumes, updateListener, attenuationFor, dispose };
}

export function setAudioParam(param: AudioParam, value: number, now: number): void {
  param.setValueAtTime(value, now);
}

export function rampAudioParam(param: AudioParam, value: number, now: number, rampSeconds: number): void {
  param.cancelScheduledValues(now);
  if (rampSeconds <= 0) {
    param.setValueAtTime(value, now);
    return;
  }
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + rampSeconds);
}

export function updatePanner(panner: PannerNode, point: AudioPoint, now: number): void {
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.maxDistance = 10_000;
  panner.rolloffFactor = 0;
  setAudioParam(panner.positionX, point.x, now);
  setAudioParam(panner.positionY, point.y, now);
  setAudioParam(panner.positionZ, point.z, now);
}

export function disconnectNode(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Already disconnected.
  }
}

function copyPoint(point: AudioPoint): AudioPoint {
  return { x: point.x, y: point.y, z: point.z };
}

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

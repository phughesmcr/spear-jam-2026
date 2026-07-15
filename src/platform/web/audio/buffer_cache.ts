import type { AudioClip } from "@/src/engine/audio/mod.ts";
import type { AudioGraph } from "@/src/platform/web/audio/graph.ts";

export type DecodedBufferCache = {
  load(clip: AudioClip): Promise<AudioBuffer | undefined>;
};

export function createDecodedBufferCache(
  host: Window,
  graph: AudioGraph,
  signal: AbortSignal,
): DecodedBufferCache {
  const buffers = new Map<string, Promise<AudioBuffer | undefined>>();

  function load(clip: AudioClip): Promise<AudioBuffer | undefined> {
    const existing = buffers.get(clip.id);
    if (existing !== undefined) return existing;

    const request = host.fetch(clip.src, { signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${clip.src}`);
        return response.arrayBuffer();
      })
      .then((data) => graph.nodes().context.decodeAudioData(data))
      .catch((error: unknown) => {
        console.warn(`Failed to load ${clip.id}.`, error);
        if (buffers.get(clip.id) === request) buffers.delete(clip.id);
        return undefined;
      });
    buffers.set(clip.id, request);
    return request;
  }

  return { load };
}

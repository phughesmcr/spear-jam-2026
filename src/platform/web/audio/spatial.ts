import type { AudioPoint } from "@/src/engine/audio/mod.ts";

export function soundAttenuationForDistance(distance: number, radius: number): number {
  const audibleRadius = Math.max(0, radius);
  const safeDistance = Math.max(0, distance);
  if (safeDistance > audibleRadius) return 0;
  return 1 - safeDistance / (audibleRadius + 1);
}

export function pointDistance(a: AudioPoint, b: AudioPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

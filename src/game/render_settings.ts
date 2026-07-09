export type SettingsSliderId = "music" | "sound" | "fps";

export const DEFAULT_INTERACTIVE_FPS = 35;
export const MIN_INTERACTIVE_FPS = 12;
export const MAX_INTERACTIVE_FPS = 60;
/** Ambient-only animation (sky/bob/flicker) stays capped to the light rebuild rate. */
export const AMBIENT_FPS = 12;

export function clampInteractiveFps(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_INTERACTIVE_FPS;
  return Math.min(MAX_INTERACTIVE_FPS, Math.max(MIN_INTERACTIVE_FPS, Math.round(value)));
}

/** Map a 0–1 slider unit onto the interactive FPS range. */
export function interactiveFpsFromUnit(unit: number): number {
  const t = Number.isFinite(unit) ? Math.min(1, Math.max(0, unit)) : 0;
  return clampInteractiveFps(
    MIN_INTERACTIVE_FPS + t * (MAX_INTERACTIVE_FPS - MIN_INTERACTIVE_FPS),
  );
}

/** Map interactive FPS onto a 0–1 slider unit. */
export function unitFromInteractiveFps(fps: number): number {
  const clamped = clampInteractiveFps(fps);
  return (clamped - MIN_INTERACTIVE_FPS) / (MAX_INTERACTIVE_FPS - MIN_INTERACTIVE_FPS);
}

export function frameMsForFps(fps: number): number {
  return 1000 / fps;
}

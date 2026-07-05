import type { GameMode } from "@/src/game/state.ts";

export const REVEAL_MS_PER_CHARACTER = 18;

export type IntermissionMode = Extract<GameMode, { readonly type: "intermission" }>;

export function currentIntermissionPage(mode: IntermissionMode): string {
  return mode.pages[mode.pageIndex] ?? "";
}

export function visibleCharacterCount(mode: IntermissionMode, nowMs: number): number {
  const page = currentIntermissionPage(mode);
  if (mode.revealed) return page.length;
  const elapsedMs = Math.max(0, nowMs - mode.revealStartedAtMs);
  return Math.min(page.length, Math.floor(elapsedMs / REVEAL_MS_PER_CHARACTER));
}

export function isMessageRevealed(mode: IntermissionMode, nowMs: number): boolean {
  return visibleCharacterCount(mode, nowMs) >= currentIntermissionPage(mode).length;
}

export function hasNextIntermissionPage(mode: IntermissionMode): boolean {
  return mode.pageIndex < mode.pages.length - 1;
}

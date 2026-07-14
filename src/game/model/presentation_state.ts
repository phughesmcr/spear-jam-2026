import { type CombatFeedback, combatFeedbackForEvents } from "@/src/game/model/combat_feedback.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import { messageForEvent } from "@/src/game/model/messages.ts";
import type { Entity } from "turn-based-engine/ecs";

const WEAPON_HUD_ACTIVE_MS = 140;
const KEY_HUD_VISIBLE_MS = 1400;
const MESSAGE_HUD_VISIBLE_MS = 2200;
const MESSAGE_HUD_MAX_LINES = 2;

export type WeaponHudPhase = "idle" | "active";

export type PresentationMessage = {
  readonly text: string;
  readonly expiresAtMs: number;
};

export type PresentationState = {
  readonly messages: readonly PresentationMessage[];
  readonly combatFeedback: readonly CombatFeedback[];
  readonly weaponHudActiveUntilMs?: number;
  readonly keyHudVisibleUntilMs?: number;
};

export type PresentationView = {
  readonly messages: readonly string[];
  readonly combatFeedback: readonly CombatFeedback[];
  readonly weaponHudPhase: WeaponHudPhase;
  readonly showKeys: boolean;
  readonly needsFrame: boolean;
};

export type PresentationViewScratch = {
  readonly messages: string[];
  messageCount: number;
  combatFeedback: readonly CombatFeedback[];
  weaponHudPhase: WeaponHudPhase;
  showKeys: boolean;
  needsFrame: boolean;
};

const MESSAGE_CAPACITY = 2;

export function createPresentationViewScratch(): PresentationViewScratch {
  return {
    messages: Array.from({ length: MESSAGE_CAPACITY }, () => ""),
    messageCount: 0,
    combatFeedback: [],
    weaponHudPhase: "idle",
    showKeys: false,
    needsFrame: false,
  };
}

export type ConsumeGameEventsInput = {
  readonly playerEntity: Entity;
  readonly events: readonly GameEvent[];
  readonly nowMs: number;
};

export function createPresentationState(): PresentationState {
  return {
    messages: [],
    combatFeedback: [],
  };
}

export function consumeGameEvents(
  state: PresentationState,
  { playerEntity, events, nowMs }: ConsumeGameEventsInput,
): PresentationState {
  const messages = activeMessages(state, nowMs);
  const activeTexts = new Set(messages.map((message) => message.text));
  const nextMessages = [...messages];

  for (const event of events) {
    const text = messageForEvent(playerEntity, event);
    if (text === "" || activeTexts.has(text)) continue;
    activeTexts.add(text);
    nextMessages.push({ text, expiresAtMs: nowMs + MESSAGE_HUD_VISIBLE_MS });
  }

  return {
    messages: nextMessages.slice(-MESSAGE_HUD_MAX_LINES),
    combatFeedback: combatFeedbackForEvents(playerEntity, events),
    ...(playerAttackOccurred(events, playerEntity) ? { weaponHudActiveUntilMs: nowMs + WEAPON_HUD_ACTIVE_MS } : {
      weaponHudActiveUntilMs: state.weaponHudActiveUntilMs,
    }),
    ...(keyHudShouldFlash(events) ? { keyHudVisibleUntilMs: nowMs + KEY_HUD_VISIBLE_MS } : {
      keyHudVisibleUntilMs: state.keyHudVisibleUntilMs,
    }),
  };
}

export function presentationView(state: PresentationState, nowMs: number): PresentationView {
  const scratch = createPresentationViewScratch();
  fillPresentationView(state, nowMs, scratch);
  return presentationViewFromScratch(scratch);
}

export function presentationViewFromScratch(scratch: PresentationViewScratch): PresentationView {
  const messages: string[] = [];
  for (let i = 0; i < scratch.messageCount; i++) {
    messages.push(scratch.messages[i]!);
  }
  return {
    messages,
    combatFeedback: scratch.combatFeedback,
    weaponHudPhase: scratch.weaponHudPhase,
    showKeys: scratch.showKeys,
    needsFrame: scratch.needsFrame,
  };
}

export function fillPresentationView(
  state: PresentationState,
  nowMs: number,
  out: PresentationViewScratch,
): void {
  const active = activeMessages(state, nowMs);
  out.messageCount = active.length;
  for (let i = 0; i < active.length; i++) {
    out.messages[i] = active[i]!.text;
  }

  const weaponHudPhase: WeaponHudPhase = isVisible(state.weaponHudActiveUntilMs, nowMs) ? "active" : "idle";
  const showKeys = isVisible(state.keyHudVisibleUntilMs, nowMs);
  out.combatFeedback = state.combatFeedback;
  out.weaponHudPhase = weaponHudPhase;
  out.showKeys = showKeys;
  out.needsFrame = active.length > 0 || weaponHudPhase === "active" || showKeys;
}

function activeMessages(state: PresentationState, nowMs: number): readonly PresentationMessage[] {
  return state.messages.filter((message) => message.expiresAtMs > nowMs);
}

function isVisible(expiresAtMs: number | undefined, nowMs: number): boolean {
  return expiresAtMs !== undefined && expiresAtMs > nowMs;
}

function playerAttackOccurred(events: readonly GameEvent[], playerEntity: Entity): boolean {
  return events.some((event) => {
    switch (event.type) {
      case "attackMissed":
      case "damageDealt":
      case "entityDefeated":
        return event.actor === playerEntity;
      default:
        return false;
    }
  });
}

function keyHudShouldFlash(events: readonly GameEvent[]): boolean {
  return events.some((event) => event.type === "keyPickedUp" || event.type === "doorLocked");
}

import { createCodeRegistry } from "@/src/game/content/code_registry.ts";

export const DisplayName = {
  John: "john",
  DigitalDog: "digitalDog",
  GigabitGunslinger: "gigabitGunslinger",
  NetworkNeophyte: "networkNeophyte",
  SystemSentinel: "systemSentinel",
  AgenticAcolyte: "agenticAcolyte",
} as const;

export type DisplayName = (typeof DisplayName)[keyof typeof DisplayName];

const DISPLAY_NAMES: Readonly<Record<DisplayName, string>> = {
  [DisplayName.John]: "John",
  [DisplayName.DigitalDog]: "Digital Dog",
  [DisplayName.GigabitGunslinger]: "Gigabit Gunslinger",
  [DisplayName.NetworkNeophyte]: "Network Neophyte",
  [DisplayName.SystemSentinel]: "System Sentinel",
  [DisplayName.AgenticAcolyte]: "Agentic Acolyte",
};

// Codes are the 1-based position of each id in this list; only ever append to keep them stable.
const DISPLAY_NAME_REGISTRY = createCodeRegistry("display name", [
  DisplayName.John,
  DisplayName.DigitalDog,
  DisplayName.GigabitGunslinger,
  DisplayName.NetworkNeophyte,
  DisplayName.SystemSentinel,
  DisplayName.AgenticAcolyte,
]);

export function displayNameText(displayName: DisplayName): string {
  return DISPLAY_NAMES[displayName];
}

export function displayNameCode(displayName: DisplayName): number {
  return DISPLAY_NAME_REGISTRY.encode(displayName);
}

export function displayNameForCode(code: number): DisplayName {
  return DISPLAY_NAME_REGISTRY.decode(code);
}

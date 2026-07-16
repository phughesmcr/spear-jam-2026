export const DisplayName = {
  John: "john",
  DigitalDog: "digitalDog",
  GigabitGunslinger: "gigabitGunslinger",
  NetworkNeophyte: "networkNeophyte",
  SystemSentinel: "systemSentinel",
  AgenticAcolyte: "agenticAcolyte",
} as const;

export type DisplayName = (typeof DisplayName)[keyof typeof DisplayName];

/** Persisted display-name codes are one-based positions in this append-only list. */
export const DISPLAY_NAME_IDS = [
  DisplayName.John,
  DisplayName.DigitalDog,
  DisplayName.GigabitGunslinger,
  DisplayName.NetworkNeophyte,
  DisplayName.SystemSentinel,
  DisplayName.AgenticAcolyte,
] as const satisfies readonly DisplayName[];

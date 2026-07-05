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

export function displayNameText(displayName: DisplayName): string {
  return DISPLAY_NAMES[displayName];
}

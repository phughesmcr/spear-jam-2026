export const DisplayName = {
  John: 0,
  DigitalDog: 1,
  GigabitGunslinger: 2,
  NetworkNeophyte: 3,
  SystemSentinel: 4,
  AgenticAcolyte: 5,
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

export function displayNameText(displayName: number): string {
  return (DISPLAY_NAMES as Readonly<Record<number, string | undefined>>)[displayName] ?? "Unknown";
}

export const DisplayName = {
  John: 0,
  Imp: 1,
  DigitalDog: 2,
  GigabitGunslinger: 3,
  NetworkNeophyte: 4,
  SystemSentinel: 5,
  AgenticAcolyte: 6,
} as const;

export type DisplayName = (typeof DisplayName)[keyof typeof DisplayName];

const DISPLAY_NAMES: Readonly<Record<DisplayName, string>> = {
  [DisplayName.John]: "John",
  [DisplayName.Imp]: "Imp",
  [DisplayName.DigitalDog]: "Digital Dog",
  [DisplayName.GigabitGunslinger]: "Gigabit Gunslinger",
  [DisplayName.NetworkNeophyte]: "Network Neophyte",
  [DisplayName.SystemSentinel]: "System Sentinel",
  [DisplayName.AgenticAcolyte]: "Agentic Acolyte",
};

export function displayNameText(displayName: number): string {
  return (DISPLAY_NAMES as Readonly<Record<number, string | undefined>>)[displayName] ?? "Unknown";
}

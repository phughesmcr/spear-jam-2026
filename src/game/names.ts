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

const DISPLAY_NAME_CODES: Readonly<Record<DisplayName, number>> = {
  [DisplayName.John]: 1,
  [DisplayName.DigitalDog]: 2,
  [DisplayName.GigabitGunslinger]: 3,
  [DisplayName.NetworkNeophyte]: 4,
  [DisplayName.SystemSentinel]: 5,
  [DisplayName.AgenticAcolyte]: 6,
};

const DISPLAY_NAMES_BY_CODE = new Map<number, DisplayName>(
  Object.entries(DISPLAY_NAME_CODES).map(([displayName, code]) => [code, displayName as DisplayName]),
);

export function displayNameText(displayName: DisplayName): string {
  return DISPLAY_NAMES[displayName];
}

export function displayNameCode(displayName: DisplayName): number {
  return DISPLAY_NAME_CODES[displayName];
}

export function displayNameForCode(code: number): DisplayName {
  const displayName = DISPLAY_NAMES_BY_CODE.get(code);
  if (displayName === undefined) throw new Error(`Unknown display name code: ${code}`);
  return displayName;
}

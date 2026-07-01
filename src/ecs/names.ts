export const DisplayName = {
  John: 0,
  Imp: 1,
} as const;

export type DisplayName = number;

const DISPLAY_NAMES: Readonly<Record<DisplayName, string>> = {
  [DisplayName.John]: "John",
  [DisplayName.Imp]: "Imp",
};

export function displayNameText(displayName: DisplayName): string {
  return DISPLAY_NAMES[displayName] ?? "Unknown";
}

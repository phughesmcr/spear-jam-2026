export const DisplayName = {
  John: 0,
} as const;

export type DisplayName = number;

const DISPLAY_NAMES: Readonly<Record<DisplayName, string>> = {
  [DisplayName.John]: "John",
};

export function displayNameText(displayName: DisplayName): string {
  return DISPLAY_NAMES[displayName] ?? "Unknown";
}

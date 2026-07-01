export const DisplayName = {
  John: 0,
  Imp: 1,
} as const;

export type DisplayName = (typeof DisplayName)[keyof typeof DisplayName];

const DISPLAY_NAMES: Readonly<Record<DisplayName, string>> = {
  [DisplayName.John]: "John",
  [DisplayName.Imp]: "Imp",
};

export function displayNameText(displayName: number): string {
  return (DISPLAY_NAMES as Readonly<Record<number, string | undefined>>)[displayName] ?? "Unknown";
}

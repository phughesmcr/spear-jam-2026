export function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`;
}

export function coerceLookup<T>(
  table: Readonly<Record<string, T>>,
  value: string,
  kind: string,
  context?: string,
): T {
  const mapped = table[value] ?? table[lowerFirst(value)];
  if (mapped === undefined) throw new Error(unknownMessage(kind, value, context));
  return mapped;
}

function unknownMessage(kind: string, value: string, context: string | undefined): string {
  const prefix = context === undefined ? "" : `${context}: `;
  return `${prefix}Unknown ${kind} "${value}".`;
}

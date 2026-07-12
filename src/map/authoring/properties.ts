import type { TiledProperty } from "@/src/map/authoring/tiled_types.ts";

export type PropertyMap = ReadonlyMap<string, unknown>;

export function readProperties(
  properties: readonly TiledProperty[] | undefined,
  allowedNames: ReadonlySet<string>,
  context: string,
): Map<string, unknown> {
  const values = new Map<string, unknown>();
  for (const property of properties ?? []) {
    if (typeof property.name !== "string" || property.name.length === 0) {
      throw new Error(`${context}: property names must be non-empty strings.`);
    }
    if (values.has(property.name)) {
      throw new Error(`${context}: Duplicate property "${property.name}".`);
    }
    if (!allowedNames.has(property.name)) {
      throw new Error(`${context}: Unknown property "${property.name}".`);
    }
    validatePropertyType(property, context);
    values.set(property.name, property.value);
  }
  return values;
}

export function mergeProperties(...sources: readonly PropertyMap[]): Map<string, unknown> {
  const merged = new Map<string, unknown>();
  for (const source of sources) {
    for (const [name, value] of source) {
      merged.set(name, value);
    }
  }
  return merged;
}

export function validatePropertyNames(
  properties: PropertyMap,
  allowedNames: ReadonlySet<string>,
  context: string,
): void {
  for (const name of properties.keys()) {
    if (!allowedNames.has(name)) {
      throw new Error(`${context}: Property "${name}" is not valid for this prefab.`);
    }
  }
}

export function requiredString(properties: PropertyMap, name: string, context: string): string {
  const value = properties.get(name);
  if (value === undefined) throw new Error(`${context}: Missing required property "${name}".`);
  if (typeof value !== "string") throw new Error(`${context}: Property "${name}" must be a string.`);
  return value;
}

export function optionalString(properties: PropertyMap, name: string, context: string): string | undefined {
  const value = properties.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`${context}: Property "${name}" must be a string.`);
  return value;
}

export function requiredInteger(properties: PropertyMap, name: string, context: string): number {
  const value = properties.get(name);
  if (value === undefined) throw new Error(`${context}: Missing required property "${name}".`);
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${context}: Property "${name}" must be an integer.`);
  }
  return value;
}

export function optionalBoolean(properties: PropertyMap, name: string, context: string): boolean | undefined {
  const value = properties.get(name);
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${context}: Property "${name}" must be a boolean.`);
  return value;
}

function validatePropertyType(property: TiledProperty, context: string): void {
  if (property.type === undefined) return;
  switch (property.type) {
    case "bool":
      if (typeof property.value === "boolean") return;
      break;
    case "float":
      if (typeof property.value === "number" && Number.isFinite(property.value)) return;
      break;
    case "int":
      if (typeof property.value === "number" && Number.isInteger(property.value)) return;
      break;
    case "string":
      if (typeof property.value === "string") return;
      break;
    default:
      throw new Error(`${context}: Property "${property.name}" has unsupported type "${property.type}".`);
  }
  throw new Error(`${context}: Property "${property.name}" type does not match its value.`);
}

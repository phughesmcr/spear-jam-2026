import type { TiledProperty } from "@/src/map/authoring/tiled_types.ts";

const JSON_INDENT = 2;

export function jsonSource(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_INDENT)}\n`;
}

export function parseJson<T>(path: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path} is not valid JSON: ${message}`);
  }
}

export async function readRequiredTextFile(path: string, missingMessage: string): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) throw new Error(missingMessage);
    throw error;
  }
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export async function checkGeneratedText(path: string, expected: string, issues: string[]): Promise<void> {
  let actual = "";
  try {
    actual = await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      issues.push(`${path} is missing. Run deno task maps:sync-authoring.`);
      return;
    }
    throw error;
  }
  if (actual !== expected) issues.push(`${path} is stale. Run deno task maps:sync-authoring.`);
}

export async function checkGeneratedBytes(path: string, expected: Uint8Array, issues: string[]): Promise<void> {
  let actual: Uint8Array;
  try {
    actual = await Deno.readFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      issues.push(`${path} is missing. Run deno task maps:sync-authoring.`);
      return;
    }
    throw error;
  }

  if (!bytesEqual(actual, expected)) issues.push(`${path} is stale. Run deno task maps:sync-authoring.`);
}

export function property(name: string, value: TiledProperty["value"], propertytype?: string): TiledProperty {
  const type = propertyTypeForValue(value);
  return propertytype === undefined ? { name, type, value } : { name, propertytype, type, value };
}

function propertyTypeForValue(value: TiledProperty["value"]): "bool" | "int" | "string" {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number" && Number.isInteger(value)) return "int";
  return "string";
}

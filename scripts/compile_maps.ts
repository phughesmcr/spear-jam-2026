import { parse } from "@std/xml";
import type { XmlElement } from "@std/xml/types";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { EnemyArchetype } from "@/src/ecs/components.ts";
import { AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";
import { ExamineTextId } from "@/src/game/examine.ts";
import { ItemKind } from "@/src/game/items.ts";
import { DisplayName } from "@/src/game/names.ts";
import { compileTiledMap } from "@/src/map/authoring/mod.ts";
import type {
  CompiledTiledMap,
  TiledMap,
  TiledProperty,
  TiledTemplate,
  TiledTileset,
} from "@/src/map/authoring/mod.ts";
import { KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
import type { EntityDef } from "@/src/map/map.ts";
import {
  BOOT_SECTOR_PALETTE,
  DATA_CONDUIT_PALETTE,
  FIREWALL_PALETTE,
  MAINFRAME_CORE_PALETTE,
  NEXUS_PALETTE,
} from "@/src/map/terrain_palettes.ts";
import { validateGameMaps } from "@/src/map/map_validation.ts";

const MAPS_DIR = "game_assets/maps";
const GENERATED_MAPS_PATH = "src/map/generated_maps.ts";

const PALETTES = {
  boot_sector: BOOT_SECTOR_PALETTE,
  data_conduit: DATA_CONDUIT_PALETTE,
  firewall: FIREWALL_PALETTE,
  nexus: NEXUS_PALETTE,
  mainframe_core: MAINFRAME_CORE_PALETTE,
} as const;

const PALETTE_EXPORTS: Readonly<Record<keyof typeof PALETTES, string>> = {
  boot_sector: "BOOT_SECTOR_PALETTE",
  data_conduit: "DATA_CONDUIT_PALETTE",
  firewall: "FIREWALL_PALETTE",
  nexus: "NEXUS_PALETTE",
  mainframe_core: "MAINFRAME_CORE_PALETTE",
};

type SymbolUse = {
  readonly attacks: Set<string>;
  readonly dialogues: Set<string>;
  readonly enemies: Set<string>;
  readonly examines: Set<string>;
  readonly items: Set<string>;
  readonly names: Set<string>;
  readonly mapConstants: Set<string>;
  readonly palettes: Set<string>;
};

type GeneratedMap = CompiledTiledMap & {
  readonly sourcePath: string;
};

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  });
}

export async function main(args: readonly string[] = Deno.args): Promise<void> {
  const mode = args[0];
  if (mode !== "--write" && mode !== "--check") {
    throw new Error("Usage: deno run -A scripts/compile_maps.ts --write|--check");
  }

  const source = await generatedSource();
  const formatted = await formatTypeScript(source);
  const maps = await compiledMaps();
  const validationIssues = validateGameMaps(maps.map((map) => map.gameMap));
  if (validationIssues.length > 0) throw new Error(`Compiled maps failed validation:\n${validationIssues.join("\n")}`);

  if (mode === "--write") {
    await Deno.writeTextFile(GENERATED_MAPS_PATH, formatted);
    return;
  }

  let existing = "";
  try {
    existing = await Deno.readTextFile(GENERATED_MAPS_PATH);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`${GENERATED_MAPS_PATH} is missing. Run deno task maps:compile.`);
    }
    throw error;
  }
  if (existing !== formatted) {
    throw new Error(`${GENERATED_MAPS_PATH} is stale. Run deno task maps:compile.`);
  }
}

async function generatedSource(): Promise<string> {
  const maps = await compiledMaps();
  const uses = symbolUse();
  const declarations = maps.map((map, index) => mapDeclaration(`MAP_${index + 1}`, map, uses));
  return [
    generatedHeader(),
    ...importLines(uses),
    "",
    ...declarations,
    `export const START_MAP_NAME = MAP_1.name;`,
    `export const GAME_MAPS = [${
      maps.map((_, index) => `MAP_${index + 1}`).join(", ")
    }] as const satisfies readonly GameMap[];`,
    "",
  ].join("\n");
}

async function compiledMaps(): Promise<readonly GeneratedMap[]> {
  const tilesets = await loadTilesets();
  const templates = await loadTemplates();
  const maps: GeneratedMap[] = [];
  for await (const entry of Deno.readDir(MAPS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".tiled.json")) continue;
    const sourcePath = `${MAPS_DIR}/${entry.name}`;
    const raw = JSON.parse(await Deno.readTextFile(sourcePath)) as TiledMap;
    maps.push({
      ...compileTiledMap(raw, { palettes: PALETTES, tilesets, templates }),
      sourcePath,
    });
  }
  maps.sort((a, b) => a.campaignOrder - b.campaignOrder || a.sourcePath.localeCompare(b.sourcePath));
  if (maps.length === 0) throw new Error(`No .tiled.json maps found in ${MAPS_DIR}`);
  return maps;
}

async function loadTilesets(): Promise<Readonly<Record<string, TiledTileset>>> {
  const tilesets: Record<string, TiledTileset> = {};
  for await (const entry of Deno.readDir(MAPS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".tiled.xml")) continue;
    const path = `${MAPS_DIR}/${entry.name}`;
    tilesets[entry.name] = parseTilesetXml(path, await Deno.readTextFile(path));
  }
  return tilesets;
}

async function loadTemplates(): Promise<Readonly<Record<string, TiledTemplate>>> {
  const templates: Record<string, TiledTemplate> = {};
  for await (const entry of Deno.readDir(`${MAPS_DIR}/templates`)) {
    if (!entry.isFile || !entry.name.endsWith(".tx")) continue;
    const registryPath = `templates/${entry.name}`;
    const path = `${MAPS_DIR}/${registryPath}`;
    templates[registryPath] = parseTemplateXml(path, await Deno.readTextFile(path));
  }
  return templates;
}

function parseTilesetXml(path: string, text: string): TiledTileset {
  const root = rootElement(path, text, "tileset");
  return {
    name: stringAttribute(root, "name", `${path}.name`),
    tilecount: integerAttribute(root, "tilecount", `${path}.tilecount`),
    tiles: childElements(root, "tile").map((tile, index) => ({
      id: integerAttribute(tile, "id", `${path}.tile[${index}].id`),
      type: optionalStringAttribute(tile, "type"),
      properties: parseXmlProperties(tile, `${path}.tile[${index}].properties`),
    })),
  };
}

function parseTemplateXml(path: string, text: string): TiledTemplate {
  const root = rootElement(path, text, "template");
  const object = requiredChild(root, "object", `${path}.object`);
  return {
    object: {
      gid: integerAttribute(object, "gid", `${path}.object.gid`),
      height: numberAttribute(object, "height", `${path}.object.height`),
      id: integerAttribute(object, "id", `${path}.object.id`),
      name: optionalStringAttribute(object, "name"),
      rotation: numberAttribute(object, "rotation", `${path}.object.rotation`, 0),
      type: optionalStringAttribute(object, "type"),
      visible: booleanAttribute(object, "visible", `${path}.object.visible`, true),
      width: numberAttribute(object, "width", `${path}.object.width`),
      x: numberAttribute(object, "x", `${path}.object.x`, 0),
      y: numberAttribute(object, "y", `${path}.object.y`, 0),
      properties: parseXmlProperties(object, `${path}.object.properties`),
    },
  };
}

function parseXmlProperties(element: XmlElement, path: string): readonly TiledProperty[] {
  const properties = optionalChild(element, "properties");
  if (properties === undefined) return [];
  return childElements(properties, "property").map((property, index) => {
    const type = optionalStringAttribute(property, "type") ?? "string";
    return {
      name: stringAttribute(property, "name", `${path}[${index}].name`),
      propertytype: optionalStringAttribute(property, "propertytype"),
      type,
      value: typedXmlValue(stringAttribute(property, "value", `${path}[${index}].value`, ""), type, path),
    };
  });
}

function typedXmlValue(value: string, type: string, path: string): string | number | boolean {
  switch (type) {
    case "bool":
      return value === "true" || value === "1";
    case "float": {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw new Error(`${path} has invalid float value "${value}"`);
      return parsed;
    }
    case "int": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) throw new Error(`${path} has invalid int value "${value}"`);
      return parsed;
    }
    case "string":
      return value;
    default:
      throw new Error(`${path} uses unsupported XML property type "${type}"`);
  }
}

function rootElement(path: string, text: string, name: string): XmlElement {
  const xml = parse(text, { trackPosition: false });
  const root = xml.root;
  if (root.name.local !== name) throw new Error(`${path} root element must be <${name}>`);
  return root;
}

function requiredChild(element: XmlElement, name: string, path: string): XmlElement {
  const child = optionalChild(element, name);
  if (child === undefined) throw new Error(`${path} is missing <${name}>`);
  return child;
}

function optionalChild(element: XmlElement, name: string): XmlElement | undefined {
  const matches = childElements(element, name);
  if (matches.length > 1) throw new Error(`<${element.name.local}> has multiple <${name}> children`);
  return matches[0];
}

function childElements(element: XmlElement, name: string): readonly XmlElement[] {
  return element.children.filter((child): child is XmlElement => child.type === "element" && child.name.local === name);
}

function stringAttribute(element: XmlElement, name: string, path: string, fallback?: string): string {
  const value = element.attributes[name];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${path} missing XML attribute "${name}"`);
  }
  return value;
}

function optionalStringAttribute(element: XmlElement, name: string): string | undefined {
  return element.attributes[name];
}

function integerAttribute(element: XmlElement, name: string, path: string, fallback?: number): number {
  const value = element.attributes[name];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${path} missing XML attribute "${name}"`);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${path} must be an integer`);
  return parsed;
}

function numberAttribute(element: XmlElement, name: string, path: string, fallback?: number): number {
  const value = element.attributes[name];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`${path} missing XML attribute "${name}"`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${path} must be a finite number`);
  return parsed;
}

function booleanAttribute(element: XmlElement, name: string, path: string, fallback: boolean): boolean {
  const value = element.attributes[name];
  if (value === undefined) return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${path} must be a boolean`);
}

function mapDeclaration(name: string, map: GeneratedMap, uses: SymbolUse): string {
  uses.palettes.add(PALETTE_EXPORTS[map.paletteKey as keyof typeof PALETTE_EXPORTS]);
  return [
    `const ${name}: GameMap = createGameMap(`,
    `  ${literal(map.gameMap.name)},`,
    `  ${json(map.gameMap.terrain.tiles)},`,
    `  [`,
    ...map.gameMap.entities.map((entity) => `    ${entityExpression(entity, uses)},`),
    `  ],`,
    `  { palette: ${PALETTE_EXPORTS[map.paletteKey as keyof typeof PALETTE_EXPORTS]} },`,
    `);`,
    "",
  ].join("\n");
}

function entityExpression(entity: EntityDef, uses: SymbolUse): string {
  const entries: string[] = [`prefab: ${literal(entity.prefab)}`, `x: ${entity.x}`, `y: ${entity.y}`];
  switch (entity.prefab) {
    case "player":
      entries.push(`dir: ${entity.dir}`);
      break;
    case "npc":
      entries.push(`dir: ${entity.dir}`);
      entries.push(`displayName: ${constantExpression(DisplayName, "DisplayName", entity.displayName, uses.names)}`);
      if (entity.dialogueTreeId !== undefined) {
        entries.push(
          `dialogueTreeId: ${
            constantExpression(DialogueTreeId, "DialogueTreeId", entity.dialogueTreeId, uses.dialogues)
          }`,
        );
      }
      if (entity.examineTextId !== undefined) {
        entries.push(
          `examineTextId: ${constantExpression(ExamineTextId, "ExamineTextId", entity.examineTextId, uses.examines)}`,
        );
      }
      break;
    case "enemy":
      entries.push(`dir: ${entity.dir}`);
      entries.push(`displayName: ${constantExpression(DisplayName, "DisplayName", entity.displayName, uses.names)}`);
      if (entity.archetype !== undefined) {
        entries.push(
          `archetype: ${constantExpression(EnemyArchetype, "EnemyArchetype", entity.archetype, uses.enemies)}`,
        );
      }
      if (entity.health !== undefined) entries.push(`health: ${entity.health}`);
      if (entity.hitDc !== undefined) entries.push(`hitDc: ${entity.hitDc}`);
      if (entity.damage !== undefined) entries.push(`damage: ${entity.damage}`);
      if (entity.attack !== undefined) entries.push(`attack: ${attackExpression(entity.attack, uses)}`);
      if (entity.examineTextId !== undefined) {
        entries.push(
          `examineTextId: ${constantExpression(ExamineTextId, "ExamineTextId", entity.examineTextId, uses.examines)}`,
        );
      }
      break;
    case "door":
      if (entity.locked !== undefined) entries.push(`locked: ${entity.locked}`);
      if (entity.color !== undefined) entries.push(`color: ${keyColorExpression(entity.color, uses)}`);
      if (entity.slide !== undefined) entries.push(`slide: ${literal(entity.slide)}`);
      if (entity.openMs !== undefined) entries.push(`openMs: ${entity.openMs}`);
      if (entity.examineTextId !== undefined) {
        entries.push(
          `examineTextId: ${constantExpression(ExamineTextId, "ExamineTextId", entity.examineTextId, uses.examines)}`,
        );
      }
      break;
    case "key":
      entries.push(`color: ${keyColorExpression(entity.color, uses)}`);
      break;
    case "uplinkCode":
      break;
    case "uplinkTerminal":
      entries.push(
        `goto: ${entity.goto === VICTORY_GOTO ? mapConstantExpression("VICTORY_GOTO", uses) : literal(entity.goto)}`,
      );
      if (entity.examineTextId !== undefined) {
        entries.push(
          `examineTextId: ${constantExpression(ExamineTextId, "ExamineTextId", entity.examineTextId, uses.examines)}`,
        );
      }
      break;
    case "weaponPickup":
      entries.push(`slot: ${entity.slot}`);
      break;
    case "item":
      entries.push(`item: ${constantExpression(ItemKind, "ItemKind", entity.item, uses.items)}`);
      entries.push(`amount: ${entity.amount}`);
      break;
  }
  return `{ ${entries.join(", ")} }`;
}

function attackExpression(
  attack: NonNullable<Extract<EntityDef, { readonly prefab: "enemy" }>["attack"]>,
  uses: SymbolUse,
): string {
  const entries: string[] = [];
  if (attack.minDamage !== undefined) entries.push(`minDamage: ${attack.minDamage}`);
  if (attack.maxDamage !== undefined) entries.push(`maxDamage: ${attack.maxDamage}`);
  if (attack.range !== undefined) entries.push(`range: ${attack.range}`);
  if (attack.requiresFacing !== undefined) {
    entries.push(
      `requiresFacing: ${
        constantExpression(AttackFacingRequirement, "AttackFacingRequirement", attack.requiresFacing, uses.attacks)
      }`,
    );
  }
  if (attack.attackBonus !== undefined) entries.push(`attackBonus: ${attack.attackBonus}`);
  if (attack.critThreshold !== undefined) entries.push(`critThreshold: ${attack.critThreshold}`);
  if (attack.critMultiplier !== undefined) entries.push(`critMultiplier: ${attack.critMultiplier}`);
  if (attack.pattern !== undefined) {
    entries.push(`pattern: ${constantExpression(AttackPattern, "AttackPattern", attack.pattern, uses.attacks)}`);
  }
  if (attack.targets !== undefined) {
    entries.push(`targets: ${constantExpression(AttackTargetMode, "AttackTargetMode", attack.targets, uses.attacks)}`);
  }
  return `{ ${entries.join(", ")} }`;
}

function keyColorExpression(color: KeyColor, uses: SymbolUse): string {
  uses.mapConstants.add("KeyColor");
  switch (color) {
    case KeyColor.Red:
      return "KeyColor.Red";
    case KeyColor.Blue:
      return "KeyColor.Blue";
    case KeyColor.Yellow:
      return "KeyColor.Yellow";
  }
}

function mapConstantExpression(name: string, uses: SymbolUse): string {
  uses.mapConstants.add(name);
  return name;
}

function constantExpression(
  table: Readonly<Record<string, string | number>>,
  namespace: string,
  value: string | number,
  uses: Set<string>,
): string {
  for (const [key, entry] of Object.entries(table)) {
    if (entry === value) {
      uses.add(namespace);
      return `${namespace}.${key}`;
    }
  }
  throw new Error(`Cannot generate ${namespace} constant for ${String(value)}`);
}

function importLines(uses: SymbolUse): readonly string[] {
  const lines: string[] = [];
  if (uses.dialogues.size > 0) lines.push(`import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";`);
  if (uses.enemies.size > 0) lines.push(`import { EnemyArchetype } from "@/src/ecs/components.ts";`);
  if (uses.attacks.size > 0) {
    lines.push(`import { AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";`);
  }
  if (uses.examines.size > 0) lines.push(`import { ExamineTextId } from "@/src/game/examine.ts";`);
  if (uses.items.size > 0) lines.push(`import { ItemKind } from "@/src/game/items.ts";`);
  if (uses.names.size > 0) lines.push(`import { DisplayName } from "@/src/game/names.ts";`);
  const mapImports = ["createGameMap", ...[...uses.mapConstants].sort()];
  lines.push(`import { ${mapImports.join(", ")} } from "@/src/map/map.ts";`);
  lines.push(`import type { GameMap } from "@/src/map/map.ts";`);
  lines.push(`import { ${[...uses.palettes].sort().join(", ")} } from "@/src/map/terrain_palettes.ts";`);
  return lines;
}

function symbolUse(): SymbolUse {
  return {
    attacks: new Set(),
    dialogues: new Set(),
    enemies: new Set(),
    examines: new Set(),
    items: new Set(),
    names: new Set(),
    mapConstants: new Set(),
    palettes: new Set(),
  };
}

async function formatTypeScript(source: string): Promise<string> {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["fmt", "--ext", "ts", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(source));
  await writer.close();
  const output = await child.output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }
  return new TextDecoder().decode(output.stdout);
}

function generatedHeader(): string {
  return "// Generated by deno task maps:compile. Edit game_assets/maps/*.tiled.json instead.";
}

function literal(value: string): string {
  return JSON.stringify(value);
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

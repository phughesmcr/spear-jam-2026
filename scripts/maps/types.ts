import type { CompiledTiledMap } from "@/src/map/authoring/compile.ts";
import type { EntityDef } from "@/src/game/world/map.ts";

export type GeneratedMap = CompiledTiledMap & {
  readonly sourcePath: string;
};

export type CompiledMapsData = {
  readonly startMapName: string;
  readonly maps: readonly CompiledMapData[];
};

export type CompiledMapData = {
  readonly name: string;
  readonly tiles: readonly (readonly number[])[];
  readonly entities: readonly EntityDef[];
};

export type NewMapOptions = {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly campaignOrder: number;
};

export type ParsedNewMapArgs = Omit<NewMapOptions, "campaignOrder"> & {
  readonly campaignOrder?: number;
  readonly output?: string;
};

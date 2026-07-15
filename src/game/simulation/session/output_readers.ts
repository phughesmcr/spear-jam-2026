import { createDrawableReaders, type RuntimeReaders } from "@/src/game/simulation/drawables.ts";
import type { DrawableEntityVisitor, LightEntityVisitor } from "@/src/game/model/render_snapshot.ts";
import type { EnemyIdleSoundSourceVisitor, SoundEmitterVisitor } from "@/src/game/model/sound.ts";
import { createSoundReaders, type SoundReaders } from "@/src/game/simulation/sounds.ts";
import type { MapSessionState } from "@/src/game/simulation/session/map_lifecycle.ts";
import type { CardinalDirection, GridPoint } from "@/src/game/world/direction.ts";
import type { TileVisibility } from "@/src/game/world/visibility.ts";
import type { Entity } from "turn-based-engine/ecs";

export type MapScopedMetadataSnapshot = Partial<{
  readonly displayName: number;
  readonly dialogueTreeId: number;
  readonly examineTextId: number;
  readonly storyId: number;
  readonly onTalkEvent: number;
  readonly terminalDestination: number;
}>;

export type OutputReaderState = {
  map: MapSessionState;
  drawables: RuntimeReaders;
  sounds: SoundReaders;
  readonly visibility: TileVisibility;
};

export function createOutputReaders(map: MapSessionState): OutputReaderState {
  const state: OutputReaderState = {
    map,
    drawables: createDrawableReaders(map.runtime),
    sounds: createSoundReaders(map.runtime),
    visibility: {
      isVisible: (x, y) => state.map.runtime.crawler.isVisibleTo(state.map.player, x, y),
      isExplored: (x, y) => state.map.runtime.crawler.isDiscoveredBy(state.map.player, x, y),
    },
  };
  return state;
}

export function replaceOutputMap(state: OutputReaderState, map: MapSessionState): void {
  state.map = map;
  state.drawables = createDrawableReaders(map.runtime);
  state.sounds = createSoundReaders(map.runtime);
}

export function playerPosition(state: OutputReaderState): GridPoint {
  return state.map.runtime.crawler.entityPosition(state.map.player);
}

export function playerFacing(state: OutputReaderState): { readonly dir: CardinalDirection } {
  const direction = state.map.runtime.crawler.entityFacing(state.map.player);
  if (direction === undefined) throw new Error("Player is missing a facing direction.");
  return { dir: direction };
}

export function mapScopedMetadata(state: OutputReaderState): readonly MapScopedMetadataSnapshot[] {
  const metadata: MapScopedMetadataSnapshot[] = [];
  for (const entity of state.map.runtime.crawler.entities()) {
    if (entity === state.map.player) continue;
    const entry: MapScopedMetadataSnapshot = {};
    copyMetadata(state.map, entity, entry);
    if (Object.keys(entry).length > 0) metadata.push(entry);
  }
  return metadata;
}

export function forEachDrawable(state: OutputReaderState, visit: DrawableEntityVisitor): void {
  state.drawables.forEachDrawable(visit);
}

export function forEachLight(state: OutputReaderState, visit: LightEntityVisitor): void {
  state.drawables.forEachLight(visit);
}

export function forEachSoundEmitter(state: OutputReaderState, visit: SoundEmitterVisitor): void {
  state.sounds.forEachSoundEmitter(visit);
}

export function forEachEnemyIdleSoundSource(state: OutputReaderState, visit: EnemyIdleSoundSourceVisitor): void {
  state.sounds.forEachEnemyIdleSoundSource(visit);
}

function copyMetadata(map: MapSessionState, entity: Entity, target: MapScopedMetadataSnapshot): void {
  const game = map.runtime.game;
  const values = [
    ["displayName", "DisplayName", "displayName"],
    ["dialogueTreeId", "DialogueTreeRef", "dialogueTreeId"],
    ["examineTextId", "ExamineTextRef", "examineTextId"],
    ["storyId", "StoryTarget", "storyId"],
    ["onTalkEvent", "OnTalkEvent", "onTalkEvent"],
    ["terminalDestination", "TerminalDestination", "destination"],
  ] as const;
  for (const [targetKey, component, field] of values) {
    if (!game.entityHasComponent(entity, game.components[component])) continue;
    (target as Record<string, number>)[targetKey] = game.storage[component].get(entity, field as never);
  }
}

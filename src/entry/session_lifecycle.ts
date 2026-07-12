import { createGameSession, type GameSession, type GameSessionOptions } from "@/src/ecs/session.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import { getMap } from "@/src/map/maps.ts";

export type SessionLifecycleSpec = {
  readonly signal: AbortSignal;
  readonly preloadAssets: (mapName: string) => Promise<void>;
};

export type LoadMapSessionSpec = SessionLifecycleSpec & GameSessionOptions & {
  readonly mapName: string;
  readonly currentSession?: GameSession;
  readonly random: RandomSource;
};

export type ExistingSessionMapSpec = SessionLifecycleSpec & {
  readonly mapName: string;
  readonly currentSession?: GameSession;
};

export type SessionLifecycleResult = {
  readonly mapName: string;
  readonly session: GameSession;
};

export async function loadMapSession(spec: LoadMapSessionSpec): Promise<SessionLifecycleResult | undefined> {
  const map = getMap(spec.mapName);
  const currentSession = spec.currentSession;
  let createdSession: GameSession | undefined;
  let loadedSession: GameSession;
  try {
    await preloadSessionAssets(spec);
    if (currentSession === undefined) {
      createdSession = await createGameSession(map, spec.random, { cheat: spec.cheat });
      loadedSession = createdSession;
    } else {
      currentSession.loadMap(map);
      loadedSession = currentSession;
    }
  } catch (error) {
    createdSession?.[Symbol.dispose]();
    throw error;
  }

  if (spec.signal.aborted) {
    createdSession?.[Symbol.dispose]();
    return undefined;
  }

  return {
    mapName: spec.mapName,
    session: loadedSession,
  };
}

export async function retryMapSession(spec: ExistingSessionMapSpec): Promise<SessionLifecycleResult | undefined> {
  await preloadSessionAssets(spec);
  if (spec.signal.aborted) return undefined;

  const session = spec.currentSession;
  if (session === undefined) {
    throw new Error("Cannot retry before the game session exists.");
  }
  session.retryMap(getMap(spec.mapName));
  if (spec.signal.aborted) return undefined;
  return { mapName: spec.mapName, session };
}

export async function resetRunSession(spec: ExistingSessionMapSpec): Promise<SessionLifecycleResult | undefined> {
  await preloadSessionAssets(spec);
  if (spec.signal.aborted) return undefined;

  const session = spec.currentSession;
  if (session === undefined) {
    throw new Error("Cannot reset before the game session exists.");
  }
  session.resetRun(getMap(spec.mapName));
  if (spec.signal.aborted) return undefined;
  return { mapName: spec.mapName, session };
}

async function preloadSessionAssets(spec: SessionLifecycleSpec & { readonly mapName: string }): Promise<void> {
  await spec.preloadAssets(spec.mapName);
}

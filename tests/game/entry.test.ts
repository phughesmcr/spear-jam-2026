import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { startGame } from "@/src/entry.ts";
import type { GameCommand, PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import { createPlayerState } from "@/src/game/state.ts";
import type { GameMode, PlayerState, PlayerStateInput } from "@/src/game/state.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { verbMenuSpriteRect } from "@/src/render/verb_menu.ts";
import { KeyColor } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

const CANVAS_SIZE: GameCanvasSize = { width: 720, height: 1280 };
const PLAYER_ENTITY = 1 as Entity;

Deno.test("Game toggles overlay modes and advances dialogue with scripted commands", async () => {
  const harness = await startHarness();
  try {
    assertEquals(harness.latestMode(), { type: "playing" });

    harness.command({ type: "menu" });
    assertEquals(harness.latestMode(), { type: "menu" });

    harness.command({ type: "menu" });
    assertEquals(harness.latestMode(), { type: "playing" });

    harness.command({ type: "pause" });
    assertEquals(harness.latestMode(), { type: "paused" });

    harness.command({ type: "pause" });
    assertEquals(harness.latestMode(), { type: "playing" });

    harness.latestSession().enqueue({
      events: [],
      dialogue: { title: "Uplink", message: "Signal acquired." },
    });
    harness.command({ type: "wait" });
    assertEquals(harness.latestMode(), {
      type: "dialogue",
      title: "Uplink",
      message: "Signal acquired.",
    });

    harness.command({ type: "wait" });
    assertEquals(harness.latestMode(), { type: "playing" });
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game only confirms a pointer verb when down and up hit the same hotspot", async () => {
  const harness = await startHarness();
  try {
    const session = harness.latestSession();

    harness.command({ type: "action" });
    assertEquals(harness.latestMode(), { type: "verbMenu", selectedIndex: 0 });

    harness.pointer(pointerAt("down", 0.17, 0.44));
    assertEquals(harness.latestMode(), { type: "verbMenu", selectedIndex: 1 });

    harness.pointer(pointerAt("up", 0.53, 0.57));
    assertEquals(session.commands, []);
    assertEquals(harness.latestMode(), { type: "verbMenu", selectedIndex: 2 });

    harness.pointer(pointerAt("down", 0.53, 0.57));
    harness.pointer(pointerAt("up", 0.53, 0.57));
    assertEquals(session.commands, [{ type: "interact", verb: "open" }]);
    assertEquals(harness.latestMode(), { type: "playing" });
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game carries the completed level player state into intermission destination loads", async () => {
  const harness = await startHarness();
  try {
    const carriedState = createPlayerState({
      heldKeys: [KeyColor.Red],
      selectedWeapon: 2,
      unlockedWeapons: [2],
      ammo: { pistol: 3 },
      health: { current: 7, max: 10 },
      hasUplinkCode: true,
      progress: { credits: 20, score: 30, xp: 40, levelCredits: 5 },
    });
    const session = harness.latestSession();
    session.state = carriedState;
    session.enqueue({ events: [], mapChange: { goto: "Level 2" } });

    harness.command({ type: "wait" });
    assertEquals(harness.latestMode(), {
      type: "intermission",
      message: "Entering Level 2. Space to continue.",
      goto: "Level 2",
      playerState: carriedState,
    });

    harness.command({ type: "wait" });
    await settleLoads();

    assertEquals(harness.latestLoad(), {
      mapName: "Level 2",
      playerState: carriedState,
    });
    assertEquals(session.disposed, true);
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game retries defeat from the level-entry snapshot instead of the defeated state", async () => {
  const harness = await startHarness();
  try {
    const entryState = createPlayerState({
      heldKeys: [KeyColor.Yellow],
      selectedWeapon: 2,
      unlockedWeapons: [2],
      ammo: { pistol: 4 },
      health: { current: 8, max: 10 },
      progress: { credits: 10, score: 15, xp: 20, levelCredits: 5 },
    });
    const firstSession = harness.latestSession();
    firstSession.state = entryState;
    firstSession.enqueue({ events: [], mapChange: { goto: "Level 2" } });

    harness.command({ type: "wait" });
    harness.command({ type: "wait" });
    await settleLoads();

    const levelSession = harness.latestSession();
    levelSession.state = createPlayerState({
      heldKeys: [KeyColor.Blue],
      selectedWeapon: 3,
      unlockedWeapons: [3],
      ammo: { cannon: 1 },
      health: { current: 0, max: 10 },
      progress: { credits: 99, score: 99, xp: 99, levelCredits: 99 },
    });
    levelSession.enqueue({ events: [], outcome: "defeat" });

    harness.command({ type: "wait" });
    assertEquals(harness.latestMode(), { type: "defeat" });

    harness.command({ type: "wait" });
    await settleLoads();

    assertEquals(harness.latestLoad(), {
      mapName: "Level 2",
      playerState: entryState,
    });
  } finally {
    harness[Symbol.dispose]();
  }
});

type RenderSnapshot = {
  readonly mode: GameMode;
};

type LoadSnapshot = {
  readonly mapName: string;
  readonly playerState?: PlayerState;
};

class FakeSession implements Disposable {
  readonly map: GameMap;
  readonly player = {
    getEntity(): Entity {
      return PLAYER_ENTITY;
    },
  };
  readonly commands: PlayerCommand[] = [];
  readonly results: PlayerCommandResult[] = [];
  state: PlayerState;
  disposed = false;

  constructor(map: GameMap, playerState?: PlayerStateInput) {
    this.map = map;
    this.state = createPlayerState(playerState);
  }

  enqueue(result: PlayerCommandResult): void {
    this.results.push(result);
  }

  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult {
    this.commands.push(command);
    return this.results.shift() ?? { events: [] };
  }

  getPlayerState(): PlayerState {
    return createPlayerState(this.state);
  }

  [Symbol.dispose](): void {
    this.disposed = true;
  }
}

class EntryHarness implements Disposable {
  readonly frames: RenderSnapshot[] = [];
  readonly loads: LoadSnapshot[] = [];
  readonly sessions: FakeSession[] = [];
  private commandReceiver?: (command: GameCommand) => void;
  private pointerReceiver?: (input: CanvasPointerInput) => void;
  private game?: Disposable;

  start(): void {
    this.game = startGame({
      canvas: {} as HTMLCanvasElement,
      ctx: {} as CanvasRenderingContext2D,
      seed: 123,
      window: {} as Window,
      runtime: {
        configureCanvasDpi: (
          _window: Window,
          _canvas: HTMLCanvasElement,
          _ctx: CanvasRenderingContext2D,
          onApply?: (size: GameCanvasSize) => void,
        ): Disposable => {
          onApply?.(CANVAS_SIZE);
          return noopDisposable();
        },
        createGameSession: (
          map: GameMap,
          _random: () => number,
          playerState?: PlayerStateInput,
        ): Promise<FakeSession> => {
          const normalizedState = playerState === undefined ? undefined : createPlayerState(playerState);
          this.loads.push({ mapName: map.name, playerState: normalizedState });
          const session = new FakeSession(map, normalizedState);
          this.sessions.push(session);
          return Promise.resolve(session);
        },
        getMap: (name: string): GameMap => fakeMap(name),
        preloadGameAssets: async (_document: Document, _onAssetLoad?: () => void): Promise<void> => {},
        renderGameFrame: (
          _ctx: CanvasRenderingContext2D,
          _canvasSize: GameCanvasSize,
          _session: unknown,
          mode: GameMode,
          _messages: readonly string[],
          _combatFeedback: readonly unknown[],
          _onAssetLoad?: () => void,
        ): void => {
          this.frames.push({ mode });
        },
        setupInput: (
          _window: Window,
          _canvas: HTMLCanvasElement,
          _canvasSize: () => GameCanvasSize,
          commandReceiver: (command: GameCommand) => void,
          pointerReceiver: (input: CanvasPointerInput) => void,
        ): Disposable => {
          this.commandReceiver = commandReceiver;
          this.pointerReceiver = pointerReceiver;
          return noopDisposable();
        },
      },
    });
  }

  command(command: GameCommand): void {
    if (this.commandReceiver === undefined) throw new Error("Game input was not initialized.");
    this.commandReceiver(command);
  }

  pointer(input: CanvasPointerInput): void {
    if (this.pointerReceiver === undefined) throw new Error("Game pointer input was not initialized.");
    this.pointerReceiver(input);
  }

  latestMode(): GameMode {
    const frame = this.frames[this.frames.length - 1];
    if (frame === undefined) throw new Error("No frame was rendered.");
    return frame.mode;
  }

  latestSession(): FakeSession {
    const session = this.sessions[this.sessions.length - 1];
    if (session === undefined) throw new Error("No session was loaded.");
    return session;
  }

  latestLoad(): LoadSnapshot {
    const load = this.loads[this.loads.length - 1];
    if (load === undefined) throw new Error("No map was loaded.");
    return load;
  }

  [Symbol.dispose](): void {
    this.game?.[Symbol.dispose]();
  }
}

async function startHarness(): Promise<EntryHarness> {
  const harness = new EntryHarness();
  harness.start();
  await settleLoads();
  return harness;
}

async function settleLoads(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function pointerAt(
  phase: CanvasPointerInput["phase"],
  localX: number,
  localY: number,
): CanvasPointerInput {
  const rect = verbMenuSpriteRect(CANVAS_SIZE);
  return {
    phase,
    x: rect.x + localX * rect.size,
    y: rect.y + localY * rect.size,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
  };
}

function fakeMap(name: string): GameMap {
  return {
    name,
    terrain: {
      palette: [
        {
          id: 0,
          color: "#000000",
          floor_texture: "floor",
          ceiling_texture: "ceiling",
        },
      ],
      tiles: [[0]],
    },
    entities: [],
  };
}

function noopDisposable(): Disposable {
  return {
    [Symbol.dispose](): void {},
  };
}

import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { startGame } from "@/src/entry.ts";
import type { GameCommand, PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import { createPlayerState } from "@/src/game/state.ts";
import type { GameMode, PlayerState, PlayerStateInput, ViewMode } from "@/src/game/state.ts";
import type { TargetMarkerTone } from "@/src/game/target_marker.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import type { FirstPersonRenderer, FirstPersonRenderSession } from "@/src/render/first_person.ts";
import type { FirstPersonHudOptions } from "@/src/render/hud.ts";
import type { RaycastScene } from "@/src/render/raycast/scene.ts";
import type { ViewRect } from "@/src/render/raycast/view.ts";
import { verbMenuSpriteRect } from "@/src/render/verb_menu.ts";
import type { WeaponHudPhase } from "@/src/render/weapon_hud.ts";
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

Deno.test("Game flashes the weapon HUD active for player attacks", async () => {
  const harness = await startHarness();
  try {
    harness.latestSession().enqueue({
      events: [{
        type: "attackMissed",
        actor: PLAYER_ENTITY,
        actorName: "You",
      }],
    });

    harness.command({ type: "attack" });
    assertEquals(harness.latestFrame().weaponHudPhase, "active");

    harness.runNextTimer();
    assertEquals(harness.latestFrame().weaponHudPhase, "idle");
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game flashes the weapon HUD active for smart action attacks", async () => {
  const harness = await startHarness();
  try {
    harness.latestSession().enqueue({
      events: [{
        type: "attackMissed",
        actor: PLAYER_ENTITY,
        actorName: "You",
      }],
    });

    harness.command({ type: "smartAction" });
    assertEquals(harness.latestFrame().weaponHudPhase, "active");
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game owns first-person renderer events and resets", async () => {
  const harness = await startHarness();
  try {
    assertEquals(harness.renderer.preloadCount, 1);
    assertEquals(harness.renderer.resetCount, 1);
    assertEquals(harness.latestFrame().renderer, harness.renderer);

    harness.command({ type: "move", direction: "forward" });
    assertEquals(harness.renderer.bumps, [{ dx: 0, dy: -1 }]);

    harness.latestSession().enqueue({
      events: [
        {
          type: "attackMissed",
          actor: 7 as Entity,
          actorName: "Imp",
        },
        {
          type: "entityDefeated",
          actor: PLAYER_ENTITY,
          entity: 7 as Entity,
          entityName: "Imp",
        },
      ],
    });
    harness.command({ type: "wait" });
    assertEquals(harness.renderer.attacks, [7 as Entity]);
    assertEquals(harness.renderer.deaths, [7 as Entity]);

    harness.command({ type: "toggleView" });
    assertEquals(harness.renderer.resetCount, 2);
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game does not flash the weapon HUD when an attack has no ammo", async () => {
  const harness = await startHarness();
  try {
    harness.latestSession().enqueue({
      events: [{ type: "noAmmo", ammo: "pistol" }],
    });

    harness.command({ type: "attack" });
    assertEquals(harness.latestFrame().weaponHudPhase, "idle");
    assertEquals(harness.latestFrame().messages, ["No pistol ammo."]);
    assertEquals(harness.pendingTimerCount(), 1);
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game does not repeat active top ephemeral messages", async () => {
  const harness = await startHarness();
  try {
    for (let i = 0; i < 10; i++) {
      harness.latestSession().enqueue({
        events: [{
          type: "attackMissed",
          actor: PLAYER_ENTITY,
          actorName: "You",
        }],
      });
      harness.command({ type: "attack" });
    }

    assertEquals(harness.latestFrame().messages, ["Nothing in range."]);
    assertEquals(harness.pendingTimerCount(), 2);

    harness.runNextTimer();
    assertEquals(harness.latestFrame().messages, []);
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game briefly shows the first-person key HUD after key pickup", async () => {
  const harness = await startHarness();
  try {
    harness.latestSession().enqueue({
      events: [{ type: "keyPickedUp", entity: 2 as Entity }],
    });

    harness.command({ type: "wait" });
    assertEquals(harness.latestFrame().firstPersonHud.showKeys, true);

    harness.runNextTimer();
    assertEquals(harness.latestFrame().firstPersonHud.showKeys, false);
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game briefly shows top ephemeral messages after player events", async () => {
  const harness = await startHarness();
  try {
    harness.latestSession().enqueue({
      events: [{ type: "ammoPickedUp", entity: 2 as Entity, ammo: "pistol", amount: 5 }],
    });

    harness.command({ type: "wait" });
    assertEquals(harness.latestFrame().messages, ["Picked up 5 pistol ammo."]);

    harness.runNextTimer();
    assertEquals(harness.latestFrame().messages, []);
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game expires top ephemeral messages independently", async () => {
  const harness = await startHarness();
  try {
    harness.latestSession().enqueue({
      events: [{ type: "ammoPickedUp", entity: 2 as Entity, ammo: "pistol", amount: 5 }],
    });
    harness.command({ type: "wait" });

    harness.latestSession().enqueue({
      events: [{ type: "healthPickedUp", entity: 2 as Entity, amount: 4, healed: 3 }],
    });
    harness.command({ type: "wait" });
    assertEquals(harness.latestFrame().messages, [
      "Picked up 5 pistol ammo.",
      "Restored 3 HP.",
    ]);

    harness.runNextTimer();
    assertEquals(harness.latestFrame().messages, ["Restored 3 HP."]);

    harness.runNextTimer();
    assertEquals(harness.latestFrame().messages, []);
  } finally {
    harness[Symbol.dispose]();
  }
});

Deno.test("Game keeps only the newest top ephemeral messages", async () => {
  const harness = await startHarness();
  try {
    harness.latestSession().enqueue({
      events: [{ type: "ammoPickedUp", entity: 2 as Entity, ammo: "pistol", amount: 5 }],
    });
    harness.command({ type: "wait" });

    harness.latestSession().enqueue({
      events: [{ type: "healthPickedUp", entity: 2 as Entity, amount: 4, healed: 3 }],
    });
    harness.command({ type: "wait" });

    harness.latestSession().enqueue({
      events: [{ type: "doorOpened", entity: 2 as Entity }],
    });
    harness.command({ type: "wait" });

    assertEquals(harness.latestFrame().messages, ["Restored 3 HP.", "Opened the door."]);
    assertEquals(harness.pendingTimerCount(), 2);
  } finally {
    harness[Symbol.dispose]();
  }
});

type RenderSnapshot = {
  readonly mode: GameMode;
  readonly messages: readonly string[];
  readonly weaponHudPhase: WeaponHudPhase;
  readonly firstPersonHud: FirstPersonHudOptions;
  readonly renderer: FirstPersonRenderer;
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
    getPosition(): { x: number; y: number } {
      return { x: 0, y: 0 };
    },
    getFacing(): { dir: 0 } {
      return { dir: 0 };
    },
  };
  readonly commands: PlayerCommand[] = [];
  readonly results: PlayerCommandResult[] = [];
  state: PlayerState;
  targetTone: TargetMarkerTone | undefined = undefined;
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

  targetMarkerTone(): TargetMarkerTone | undefined {
    return this.targetTone;
  }

  [Symbol.dispose](): void {
    this.disposed = true;
  }
}

class FakeFirstPersonRenderer implements FirstPersonRenderer {
  readonly bumps: { readonly dx: number; readonly dy: number }[] = [];
  readonly attacks: Entity[] = [];
  readonly deaths: Entity[] = [];
  preloadCount = 0;
  resetCount = 0;
  renderCount = 0;

  preloadAssets(_document: Document, _onAssetLoad?: () => void): Promise<void> {
    this.preloadCount++;
    return Promise.resolve();
  }

  reset(): void {
    this.resetCount++;
  }

  bump(dirX: number, dirY: number): void {
    this.bumps.push({ dx: dirX, dy: dirY });
  }

  markSpriteAttack(entity: Entity): void {
    this.attacks.push(entity);
  }

  markSpriteDeath(entity: Entity): void {
    this.deaths.push(entity);
  }

  sceneForMap(_map: GameMap): RaycastScene {
    throw new Error("Fake renderer does not build scenes.");
  }

  render(
    _ctx: CanvasRenderingContext2D,
    _rect: ViewRect,
    _session: FirstPersonRenderSession,
    _targetTone?: TargetMarkerTone,
    _repaint?: () => void,
  ): void {
    this.renderCount++;
  }
}

class EntryHarness implements Disposable {
  readonly frames: RenderSnapshot[] = [];
  readonly loads: LoadSnapshot[] = [];
  readonly sessions: FakeSession[] = [];
  readonly renderer = new FakeFirstPersonRenderer();
  private readonly timers = new Map<number, () => void>();
  private nextTimerId = 1;
  private commandReceiver?: (command: GameCommand) => void;
  private pointerReceiver?: (input: CanvasPointerInput) => void;
  private game?: Disposable;

  start(): void {
    this.game = startGame({
      canvas: {} as HTMLCanvasElement,
      ctx: {} as CanvasRenderingContext2D,
      seed: 123,
      window: {
        setTimeout: (callback: () => void): number => {
          const timerId = this.nextTimerId;
          this.nextTimerId++;
          this.timers.set(timerId, callback);
          return timerId;
        },
        clearTimeout: (timerId: number): void => {
          this.timers.delete(timerId);
        },
      } as unknown as Window,
      runtime: {
        createFirstPersonRenderer: (): FirstPersonRenderer => this.renderer,
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
        preloadGameAssets: (
          document: Document,
          renderer: FirstPersonRenderer,
          onAssetLoad?: () => void,
        ): Promise<void> => renderer.preloadAssets(document, onAssetLoad),
        renderGameFrame: (
          _ctx: CanvasRenderingContext2D,
          _canvasSize: GameCanvasSize,
          _session: unknown,
          mode: GameMode,
          messages: readonly string[],
          _combatFeedback: readonly unknown[],
          _viewMode: ViewMode,
          weaponHudPhase: WeaponHudPhase,
          renderer: FirstPersonRenderer,
          firstPersonHud: FirstPersonHudOptions,
          _onAssetLoad?: () => void,
        ): void => {
          this.frames.push({ mode, messages, weaponHudPhase, firstPersonHud, renderer });
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
    return this.latestFrame().mode;
  }

  latestFrame(): RenderSnapshot {
    const frame = this.frames[this.frames.length - 1];
    if (frame === undefined) throw new Error("No frame was rendered.");
    return frame;
  }

  pendingTimerCount(): number {
    return this.timers.size;
  }

  runNextTimer(): void {
    const timer = this.timers.entries().next();
    if (timer.done) throw new Error("No pending timer.");

    const [timerId, callback] = timer.value;
    this.timers.delete(timerId);
    callback();
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

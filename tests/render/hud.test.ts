import { assertAlmostEquals, assertEquals } from "@std/assert";
import type { PlayerStatusSnapshot } from "@/src/game/state.ts";
import { Direction } from "@/src/grid/direction.ts";
import { KeyColor } from "@/src/map/map.ts";
import { renderFirstPersonHud } from "@/src/render/hud.ts";
import {
  firstPersonCompassMarkers,
  firstPersonCompassMarkersAtAngle,
  firstPersonCompassRect,
  renderFirstPersonCompass,
  renderFirstPersonCompassAtAngle,
} from "@/src/render/hud_compass.ts";
import { firstPersonHudPanels, preloadHudAssets } from "@/src/render/hud_meters.ts";
import type { FirstPersonHudPanel } from "@/src/render/hud_meters.ts";

const CANVAS = { width: 720, height: 1280 };
const HUD_MARGIN = 12;

Deno.test("firstPersonCompassRect anchors the compass to the top center", () => {
  assertEquals(firstPersonCompassRect(CANVAS), {
    x: 150,
    y: 32,
    width: 420,
    height: 54,
  });
});

Deno.test("firstPersonCompassMarkers centers the player's facing direction", () => {
  assertEquals(firstPersonCompassMarkers(Direction.North), [
    { direction: Direction.West, label: "W", offset: -1, active: false },
    { direction: Direction.North, label: "N", offset: 0, active: true },
    { direction: Direction.East, label: "E", offset: 1, active: false },
  ]);
  assertEquals(firstPersonCompassMarkers(Direction.South), [
    { direction: Direction.East, label: "E", offset: -1, active: false },
    { direction: Direction.South, label: "S", offset: 0, active: true },
    { direction: Direction.West, label: "W", offset: 1, active: false },
  ]);
});

Deno.test("firstPersonCompassMarkersAtAngle slides labels between cardinal facings", () => {
  const markers = firstPersonCompassMarkersAtAngle(Math.PI / 4);

  assertEquals(markers.map(({ label }) => label), ["N", "E", "S", "W"]);
  for (const [index, offset] of [-1.5, -0.5, 0.5, 1.5].entries()) {
    assertAlmostEquals(markers[index]!.offset, offset);
    assertEquals(markers[index]!.active, false);
  }
});

Deno.test("renderFirstPersonCompass draws the current facing label at top center", () => {
  const ctx = new FakeHudContext(new FakeHudDocument());
  renderFirstPersonCompass(ctx as unknown as CanvasRenderingContext2D, CANVAS, Direction.South);

  const foregroundLabels = ctx.fillTexts
    .filter((_, index) => index % 2 === 1)
    .map(({ text, x, y }) => ({ text, x, y }));
  assertEquals(foregroundLabels, [
    { text: "E", x: 247, y: 46 },
    { text: "S", x: 360, y: 46 },
    { text: "W", x: 473, y: 46 },
  ]);
});

Deno.test("renderFirstPersonCompassAtAngle draws tweened labels between facings", () => {
  const ctx = new FakeHudContext(new FakeHudDocument());
  renderFirstPersonCompassAtAngle(ctx as unknown as CanvasRenderingContext2D, CANVAS, Math.PI / 4);

  const foregroundLabels = ctx.fillTexts
    .filter((_, index) => index % 2 === 1)
    .map(({ text, x, y }) => ({ text, x, y }));
  assertEquals(foregroundLabels, [
    { text: "N", x: 190.5, y: 46 },
    { text: "E", x: 303.5, y: 46 },
    { text: "S", x: 416.5, y: 46 },
    { text: "W", x: 529.5, y: 46 },
  ]);
});

Deno.test("firstPersonHudPanels anchors health to the bottom-left edge", () => {
  const panels = firstPersonHudPanels(CANVAS, playerSnapshot());
  assertEquals(panelKinds(panels), ["health"]);

  const health = expectPanel(panels[0], "health");
  assertEquals(health.rect.x, HUD_MARGIN);
  assertEquals(health.rect.y + health.rect.height, CANVAS.height - HUD_MARGIN);
  assertEquals(health.value, { current: 10, max: 10 });
});

Deno.test("firstPersonHudPanels shows ammo only for ranged selected weapons", () => {
  const melee = firstPersonHudPanels(CANVAS, playerSnapshot({ ammo: { pistol: 7, cannon: 4 } }));
  assertEquals(panelKinds(melee), ["health"]);

  const pistol = firstPersonHudPanels(
    CANVAS,
    playerSnapshot({
      selectedWeapon: 2,
      unlockedWeapons: [2],
      ammo: { pistol: 7, cannon: 4 },
    }),
  );
  assertEquals(panelKinds(pistol), ["health", "ammo"]);
  const pistolAmmo = expectPanel(pistol[1], "ammo");
  assertEquals(pistolAmmo.rect.x + pistolAmmo.rect.width, CANVAS.width - HUD_MARGIN);
  assertEquals(pistolAmmo.ammo, "pistol");
  assertEquals(pistolAmmo.amount, 7);

  const cannon = firstPersonHudPanels(
    CANVAS,
    playerSnapshot({
      selectedWeapon: 3,
      unlockedWeapons: [3],
      ammo: { pistol: 7, cannon: 4 },
    }),
  );
  const cannonAmmo = expectPanel(cannon[1], "ammo");
  assertEquals(cannonAmmo.ammo, "cannon");
  assertEquals(cannonAmmo.amount, 4);
});

Deno.test("firstPersonHudPanels shows keys only when explicitly requested", () => {
  const playerState = playerSnapshot({
    heldKeys: [KeyColor.Red, KeyColor.Yellow],
  });
  assertEquals(panelKinds(firstPersonHudPanels(CANVAS, playerState)), ["health"]);

  const panels = firstPersonHudPanels(CANVAS, playerState, { showKeys: true });
  assertEquals(panelKinds(panels), ["health", "keys"]);
  const keys = expectPanel(panels[1], "keys");
  assertEquals(keys.heldKeys, [KeyColor.Red, KeyColor.Yellow]);
  assertEquals(keys.rect.x, Math.round((CANVAS.width - keys.rect.width) / 2));
  assertEquals(keys.rect.y, Math.round((CANVAS.height - keys.rect.height) / 2));
});

Deno.test("renderFirstPersonHud aligns key color overlays to the key bar slots", async () => {
  const document = new FakeHudDocument();
  const preload = preloadHudAssets(document as unknown as Document);
  for (const image of document.images) image.dispatch("load");
  await preload;

  const ctx = new FakeHudContext(document);
  renderFirstPersonHud(
    ctx as unknown as CanvasRenderingContext2D,
    CANVAS,
    playerSnapshot({ heldKeys: [KeyColor.Red, KeyColor.Yellow, KeyColor.Blue] }),
    { showKeys: true },
  );

  assertEquals(ctx.ellipses, [
    { x: 305.5, y: 640.5, radiusX: 15.5, radiusY: 15.5 },
    { x: 360, y: 640.5, radiusX: 15, radiusY: 15.5 },
    { x: 413.5, y: 640.5, radiusX: 15.5, radiusY: 15.5 },
  ]);
});

function panelKinds(panels: ReturnType<typeof firstPersonHudPanels>): readonly string[] {
  return panels.map((panel) => panel.kind);
}

function expectPanel<Kind extends FirstPersonHudPanel["kind"]>(
  panel: FirstPersonHudPanel | undefined,
  kind: Kind,
): Extract<FirstPersonHudPanel, { readonly kind: Kind }> {
  if (panel?.kind !== kind) {
    throw new Error(`Expected ${kind} panel.`);
  }
  return panel as Extract<FirstPersonHudPanel, { readonly kind: Kind }>;
}

type PlayerSnapshotPatch =
  & Partial<Omit<PlayerStatusSnapshot, "ammo" | "health" | "progress">>
  & {
    readonly ammo?: Partial<PlayerStatusSnapshot["ammo"]>;
    readonly health?: Partial<PlayerStatusSnapshot["health"]>;
    readonly progress?: Partial<PlayerStatusSnapshot["progress"]>;
  };

function playerSnapshot(patch: PlayerSnapshotPatch = {}): PlayerStatusSnapshot {
  return {
    heldKeys: patch.heldKeys ?? [],
    selectedWeapon: patch.selectedWeapon ?? 1,
    unlockedWeapons: patch.unlockedWeapons ?? [1],
    ammo: {
      pistol: patch.ammo?.pistol ?? 0,
      cannon: patch.ammo?.cannon ?? 0,
    },
    health: {
      current: patch.health?.current ?? 10,
      max: patch.health?.max ?? 10,
    },
    hasUplinkCode: patch.hasUplinkCode ?? false,
    progress: {
      credits: patch.progress?.credits ?? 0,
      score: patch.progress?.score ?? 0,
      xp: patch.progress?.xp ?? 0,
      levelCredits: patch.progress?.levelCredits ?? 0,
    },
  };
}

type FakeImageEvent = "load" | "error";
type FakeImageListener = () => void;

class FakeHudImage {
  decoding: "async" | "auto" | "sync" = "auto";
  src = "";
  private readonly listeners: Record<FakeImageEvent, FakeImageListener[]> = {
    load: [],
    error: [],
  };

  addEventListener(type: FakeImageEvent, listener: FakeImageListener): void {
    this.listeners[type].push(listener);
  }

  dispatch(type: FakeImageEvent): void {
    for (const listener of this.listeners[type]) listener();
  }
}

class FakeHudDocument {
  readonly images: FakeHudImage[] = [];

  createElement(tagName: string): FakeHudImage {
    if (tagName !== "img") throw new Error(`Unexpected tag ${tagName}.`);

    const image = new FakeHudImage();
    this.images.push(image);
    return image;
  }
}

type FakeEllipseCall = {
  readonly x: number;
  readonly y: number;
  readonly radiusX: number;
  readonly radiusY: number;
};

type FakeTextCall = {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fillStyle: string;
};

class FakeHudContext {
  readonly canvas: { readonly ownerDocument: FakeHudDocument };
  fillStyle = "";
  font = "";
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  lineCap: CanvasLineCap = "butt";
  lineWidth = 1;
  strokeStyle = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly ellipses: FakeEllipseCall[] = [];
  readonly fillTexts: FakeTextCall[] = [];

  constructor(document: FakeHudDocument) {
    this.canvas = { ownerDocument: document };
  }

  save(): void {}

  restore(): void {}

  beginPath(): void {}

  closePath(): void {}

  fill(): void {}

  fillRect(_x: number, _y: number, _width: number, _height: number): void {}

  drawImage(_image: CanvasImageSource, _x: number, _y: number, _width: number, _height: number): void {}

  fillText(text: string, x: number, y: number): void {
    this.fillTexts.push({ text, x, y, fillStyle: this.fillStyle });
  }

  lineTo(_x: number, _y: number): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 7 } as TextMetrics;
  }

  moveTo(_x: number, _y: number): void {}

  stroke(): void {}

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    _rotation: number,
    _startAngle: number,
    _endAngle: number,
  ): void {
    this.ellipses.push({ x, y, radiusX, radiusY });
  }
}

import { assertEquals } from "@std/assert";
import { createPlayerState } from "@/src/game/state.ts";
import { KeyColor } from "@/src/map/map.ts";
import { firstPersonHudPanels, preloadHudAssets, renderFirstPersonHud } from "@/src/render/hud.ts";
import type { FirstPersonHudPanel } from "@/src/render/hud.ts";

const CANVAS = { width: 720, height: 1280 };
const HUD_MARGIN = 12;

Deno.test("firstPersonHudPanels anchors health to the bottom-left edge", () => {
  const panels = firstPersonHudPanels(CANVAS, createPlayerState());
  assertEquals(panelKinds(panels), ["health"]);

  const health = expectPanel(panels[0], "health");
  assertEquals(health.rect.x, HUD_MARGIN);
  assertEquals(health.rect.y + health.rect.height, CANVAS.height - HUD_MARGIN);
  assertEquals(health.value, { current: 10, max: 10 });
});

Deno.test("firstPersonHudPanels shows ammo only for ranged selected weapons", () => {
  const melee = firstPersonHudPanels(CANVAS, createPlayerState({ ammo: { pistol: 7, cannon: 4 } }));
  assertEquals(panelKinds(melee), ["health"]);

  const pistol = firstPersonHudPanels(
    CANVAS,
    createPlayerState({
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
    createPlayerState({
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
  const playerState = createPlayerState({
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
    createPlayerState({ heldKeys: [KeyColor.Red, KeyColor.Yellow, KeyColor.Blue] }),
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

class FakeHudContext {
  readonly canvas: { readonly ownerDocument: FakeHudDocument };
  fillStyle = "";
  font = "";
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly ellipses: FakeEllipseCall[] = [];

  constructor(document: FakeHudDocument) {
    this.canvas = { ownerDocument: document };
  }

  save(): void {}

  restore(): void {}

  beginPath(): void {}

  fill(): void {}

  fillRect(_x: number, _y: number, _width: number, _height: number): void {}

  drawImage(_image: CanvasImageSource, _x: number, _y: number, _width: number, _height: number): void {}

  fillText(_text: string, _x: number, _y: number): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 7 } as TextMetrics;
  }

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

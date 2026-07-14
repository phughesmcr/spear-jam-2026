import type { AmmoKind, PlayerHealthState, PlayerStatusSnapshot } from "@/src/game/model/state.ts";
import { KeyColor } from "@/src/game/content/map_entities.ts";
import { createImageAsset, loadedImage, preloadImageAssets } from "@/src/engine/canvas/image_assets.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import { fitText, monoFont } from "@/src/game/presentation/ui/text.ts";

const HUD_MARGIN = 12;

const FIRST_PERSON_METER_MAX_WIDTH_FRACTION = 0.34;
const FIRST_PERSON_METER_MAX_HEIGHT_FRACTION = 0.14;
const FIRST_PERSON_KEY_MAX_WIDTH_FRACTION = 0.34;
const FIRST_PERSON_KEY_MAX_HEIGHT_FRACTION = 0.12;
const FIRST_PERSON_PANEL_MIN_SIZE = 1;
const FIRST_PERSON_PANEL_TEXT = "#dffcff";
const FIRST_PERSON_PANEL_MUTED = "#7f8c95";
const FIRST_PERSON_PANEL_SHADOW = "rgba(0, 0, 0, 0.76)";
const FIRST_PERSON_PANEL_FILL_BACKGROUND = "rgba(4, 8, 11, 0.62)";
const FIRST_PERSON_HEALTH_FILL = "rgba(34, 211, 238, 0.45)";
const FIRST_PERSON_HEALTH_WARNING_FILL = "rgba(96%, 62%, 42%, 0.45)";
const FIRST_PERSON_HEALTH_GOOD_FILL = "rgb(12.9%,83.1%,84.7%,0.45)";
const FIRST_PERSON_AMMO_FILL = "rgba(34, 211, 238, 0.45)";
const FIRST_PERSON_RED_KEY = "#ef4444";
const FIRST_PERSON_BLUE_KEY = "#60a5fa";
const FIRST_PERSON_YELLOW_KEY = "#facc15";

const HEALTH_BAR_IMAGE_SIZE = { width: 1230, height: 454 };
const AMMO_BAR_IMAGE_SIZE = { width: 1221, height: 472 };
const KEY_BAR_IMAGE_SIZE = { width: 1097, height: 405 };

const HEALTH_VALUE_RECT = { x: 0.25, y: 0.29, width: 0.62, height: 0.43 };
const AMMO_VALUE_RECT = { x: 0.14, y: 0.29, width: 0.60, height: 0.43 };

const KEY_SLOT_RECTS: Readonly<Record<KeyColor, Readonly<UnitRect>>> = {
  [KeyColor.Red]: keySlotRect(234, 137, 138, 139),
  [KeyColor.Yellow]: keySlotRect(481, 137, 136, 139),
  [KeyColor.Blue]: keySlotRect(718, 137, 137, 139),
};

const firstPersonHudAssets = {
  health: createImageAsset(new URL("../../../../assets/game/ui/health_bar.png", import.meta.url).href),
  ammo: createImageAsset(new URL("../../../../assets/game/ui/ammo_bar.png", import.meta.url).href),
  keys: createImageAsset(new URL("../../../../assets/game/ui/key_bar_ryb.png", import.meta.url).href),
} as const;

const FIRST_PERSON_HUD_IMAGE_ASSETS = Object.freeze([
  firstPersonHudAssets.health,
  firstPersonHudAssets.ammo,
  firstPersonHudAssets.keys,
]);

type UnitRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type HudRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type HudImageSize = {
  readonly width: number;
  readonly height: number;
};

function keySlotRect(x: number, y: number, width: number, height: number): UnitRect {
  return {
    x: x / KEY_BAR_IMAGE_SIZE.width,
    y: y / KEY_BAR_IMAGE_SIZE.height,
    width: width / KEY_BAR_IMAGE_SIZE.width,
    height: height / KEY_BAR_IMAGE_SIZE.height,
  };
}

export type FirstPersonMeterOptions = {
  readonly showKeys?: boolean;
};

export type FirstPersonHudPanel =
  | {
    readonly kind: "health";
    readonly rect: HudRect;
    readonly value: PlayerHealthState;
  }
  | {
    readonly kind: "ammo";
    readonly rect: HudRect;
    readonly ammo: AmmoKind;
    readonly amount: number;
  }
  | {
    readonly kind: "keys";
    readonly rect: HudRect;
    readonly heldKeys: readonly KeyColor[];
  };

export async function preloadHudAssets(document: Document, onAssetLoad?: () => void): Promise<void> {
  await preloadImageAssets(document, FIRST_PERSON_HUD_IMAGE_ASSETS, onAssetLoad);
}

export function renderFirstPersonMeterPanels(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  playerState: PlayerStatusSnapshot,
  options: FirstPersonMeterOptions = {},
  onAssetLoad?: () => void,
): void {
  const panels = firstPersonHudPanels(canvasSize, playerState, options);
  if (panels.length === 0) return;

  ctx.save();
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  for (const panel of panels) {
    switch (panel.kind) {
      case "health":
        renderHealthPanel(ctx, panel, onAssetLoad);
        break;
      case "ammo":
        renderAmmoPanel(ctx, panel, onAssetLoad);
        break;
      case "keys":
        renderKeyPanel(ctx, panel, onAssetLoad);
        break;
    }
  }

  ctx.imageSmoothingEnabled = smoothing;
  ctx.restore();
}

export function firstPersonHudPanels(
  canvasSize: GameCanvasSize,
  playerState: PlayerStatusSnapshot,
  options: FirstPersonMeterOptions = {},
): readonly FirstPersonHudPanel[] {
  const panels: FirstPersonHudPanel[] = [{
    kind: "health",
    rect: bottomLeftPanelRect(canvasSize, HEALTH_BAR_IMAGE_SIZE),
    value: playerState.health,
  }];

  const selectedAmmo = selectedWeaponAmmo(playerState);
  if (selectedAmmo !== undefined) {
    panels.push({
      kind: "ammo",
      rect: bottomRightPanelRect(canvasSize, AMMO_BAR_IMAGE_SIZE),
      ...selectedAmmo,
    });
  }

  if (options.showKeys === true) {
    panels.push({
      kind: "keys",
      rect: centerPanelRect(canvasSize, KEY_BAR_IMAGE_SIZE),
      heldKeys: playerState.heldKeys,
    });
  }

  return panels;
}

function selectedWeaponAmmo(
  playerState: PlayerStatusSnapshot,
): Pick<Extract<FirstPersonHudPanel, { kind: "ammo" }>, "ammo" | "amount"> | undefined {
  switch (playerState.selectedWeapon) {
    case 1:
      return undefined;
    case 2:
      return { ammo: "pistol", amount: playerState.ammo.pistol };
    case 3:
      return { ammo: "cannon", amount: playerState.ammo.cannon };
  }
}

function bottomLeftPanelRect(canvasSize: GameCanvasSize, imageSize: HudImageSize): HudRect {
  const size = scaledPanelSize(
    canvasSize,
    imageSize,
    FIRST_PERSON_METER_MAX_WIDTH_FRACTION,
    FIRST_PERSON_METER_MAX_HEIGHT_FRACTION,
  );
  return {
    x: HUD_MARGIN,
    y: canvasSize.height - HUD_MARGIN - size.height,
    ...size,
  };
}

function bottomRightPanelRect(canvasSize: GameCanvasSize, imageSize: HudImageSize): HudRect {
  const size = scaledPanelSize(
    canvasSize,
    imageSize,
    FIRST_PERSON_METER_MAX_WIDTH_FRACTION,
    FIRST_PERSON_METER_MAX_HEIGHT_FRACTION,
  );
  return {
    x: canvasSize.width - HUD_MARGIN - size.width,
    y: canvasSize.height - HUD_MARGIN - size.height,
    ...size,
  };
}

function centerPanelRect(canvasSize: GameCanvasSize, imageSize: HudImageSize): HudRect {
  const size = scaledPanelSize(
    canvasSize,
    imageSize,
    FIRST_PERSON_KEY_MAX_WIDTH_FRACTION,
    FIRST_PERSON_KEY_MAX_HEIGHT_FRACTION,
  );
  return {
    x: Math.round((canvasSize.width - size.width) / 2),
    y: Math.round((canvasSize.height - size.height) / 2),
    ...size,
  };
}

function scaledPanelSize(
  canvasSize: GameCanvasSize,
  imageSize: HudImageSize,
  maxWidthFraction: number,
  maxHeightFraction: number,
): Pick<HudRect, "width" | "height"> {
  const imageWidth = Math.max(FIRST_PERSON_PANEL_MIN_SIZE, imageSize.width);
  const imageHeight = Math.max(FIRST_PERSON_PANEL_MIN_SIZE, imageSize.height);
  const scale = Math.min(
    (canvasSize.width * maxWidthFraction) / imageWidth,
    (canvasSize.height * maxHeightFraction) / imageHeight,
  );
  return {
    width: Math.max(FIRST_PERSON_PANEL_MIN_SIZE, Math.round(imageWidth * scale)),
    height: Math.max(FIRST_PERSON_PANEL_MIN_SIZE, Math.round(imageHeight * scale)),
  };
}

function renderHealthPanel(
  ctx: CanvasRenderingContext2D,
  panel: Extract<FirstPersonHudPanel, { kind: "health" }>,
  onAssetLoad?: () => void,
): void {
  const image = loadedImage(ctx, firstPersonHudAssets.health, onAssetLoad);
  if (image === undefined) return;

  const valueRect = rectInPanel(panel.rect, HEALTH_VALUE_RECT);
  const ratio = healthRatio(panel.value);
  ctx.fillStyle = FIRST_PERSON_PANEL_FILL_BACKGROUND;
  ctx.fillRect(valueRect.x, valueRect.y, valueRect.width, valueRect.height);
  ctx.fillStyle = healthFillColor(panel.value);
  ctx.fillRect(valueRect.x, valueRect.y, Math.round(valueRect.width * ratio), valueRect.height);
  ctx.drawImage(image, panel.rect.x, panel.rect.y, panel.rect.width, panel.rect.height);
  drawPanelText(ctx, `${panel.value.current}/${panel.value.max}`, valueRect, FIRST_PERSON_PANEL_TEXT);
}

function renderAmmoPanel(
  ctx: CanvasRenderingContext2D,
  panel: Extract<FirstPersonHudPanel, { kind: "ammo" }>,
  onAssetLoad?: () => void,
): void {
  const image = loadedImage(ctx, firstPersonHudAssets.ammo, onAssetLoad);
  if (image === undefined) return;

  const valueRect = rectInPanel(panel.rect, AMMO_VALUE_RECT);
  ctx.fillStyle = panel.amount === 0 ? FIRST_PERSON_PANEL_FILL_BACKGROUND : FIRST_PERSON_AMMO_FILL;
  ctx.fillRect(valueRect.x, valueRect.y, valueRect.width, valueRect.height);
  ctx.drawImage(image, panel.rect.x, panel.rect.y, panel.rect.width, panel.rect.height);
  drawPanelText(
    ctx,
    `${ammoLabel(panel.ammo)} ${panel.amount}`,
    valueRect,
    panel.amount === 0 ? FIRST_PERSON_PANEL_MUTED : FIRST_PERSON_PANEL_TEXT,
  );
}

function renderKeyPanel(
  ctx: CanvasRenderingContext2D,
  panel: Extract<FirstPersonHudPanel, { kind: "keys" }>,
  onAssetLoad?: () => void,
): void {
  const image = loadedImage(ctx, firstPersonHudAssets.keys, onAssetLoad);
  if (image === undefined) return;

  for (const key of panel.heldKeys) {
    const slot = rectInPanel(panel.rect, KEY_SLOT_RECTS[key]);
    ctx.fillStyle = keyColor(key);
    ctx.globalAlpha = 0.74;
    ctx.beginPath();
    ctx.ellipse(
      slot.x + slot.width / 2,
      slot.y + slot.height / 2,
      slot.width / 2,
      slot.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.drawImage(image, panel.rect.x, panel.rect.y, panel.rect.width, panel.rect.height);
}

function rectInPanel(panel: HudRect, unitRect: UnitRect): HudRect {
  return {
    x: Math.round(panel.x + panel.width * unitRect.x),
    y: Math.round(panel.y + panel.height * unitRect.y),
    width: Math.round(panel.width * unitRect.width),
    height: Math.round(panel.height * unitRect.height),
  };
}

function healthRatio(health: PlayerHealthState): number {
  if (health.max <= 0) return 0;
  return Math.max(0, Math.min(1, health.current / health.max));
}

function healthFillColor(health: PlayerHealthState): string {
  const ratio = healthRatio(health);
  if (ratio <= 0.3) return FIRST_PERSON_HEALTH_FILL;
  if (ratio <= 0.6) return FIRST_PERSON_HEALTH_WARNING_FILL;
  return FIRST_PERSON_HEALTH_GOOD_FILL;
}

function drawPanelText(ctx: CanvasRenderingContext2D, text: string, rect: HudRect, color: string): void {
  const fontSize = Math.max(10, Math.min(22, Math.round(rect.height * 0.56)));
  ctx.font = monoFont(700, fontSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = FIRST_PERSON_PANEL_SHADOW;
  const fittedText = fitText(ctx, text, Math.max(1, rect.width - 6));
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  ctx.fillText(fittedText, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(fittedText, x, y);
}

function ammoLabel(ammo: AmmoKind): string {
  switch (ammo) {
    case "pistol":
      return "P";
    case "cannon":
      return "C";
  }
}

function keyColor(key: KeyColor): string {
  switch (key) {
    case KeyColor.Red:
      return FIRST_PERSON_RED_KEY;
    case KeyColor.Blue:
      return FIRST_PERSON_BLUE_KEY;
    case KeyColor.Yellow:
      return FIRST_PERSON_YELLOW_KEY;
  }
}

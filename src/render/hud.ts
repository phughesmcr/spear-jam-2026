import type { GameSession } from "@/src/ecs/session.ts";
import type { PlayerStateSnapshot } from "@/src/ecs/progression.ts";
import type { AmmoKind, PlayerHealthState } from "@/src/game/state.ts";
import { type CardinalDirection, Direction, normalizeDirection } from "@/src/grid/direction.ts";
import { KeyColor } from "@/src/map/map.ts";
import { createImageAsset, loadedImage, preloadImageAssets } from "@/src/render/assets.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { fitText, monoFont } from "@/src/render/text.ts";

const HUD_MARGIN = 12;
const HUD_PADDING = 10;
const HUD_WIDTH = 300;
const HUD_LINE_HEIGHT = 18;
const HUD_BACKGROUND = "rgba(0, 0, 0, 0.58)";
const HUD_TEXT = "#f3f4f6";
const HUD_MUTED = "#aeb7c2";
const HUD_ACCENT = "#f0c84b";
const HUD_DANGER = "#df4f45";
const HUD_WARNING = "#fde68a";

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
const FIRST_PERSON_COMPASS_TOP = 32;
const FIRST_PERSON_COMPASS_HEIGHT = 54;
const FIRST_PERSON_COMPASS_MAX_WIDTH = 420;
const FIRST_PERSON_COMPASS_MIN_WIDTH = 180;
const FIRST_PERSON_COMPASS_WIDTH_FRACTION = 0.6;
const FIRST_PERSON_COMPASS_CARDINAL_SPACING_FRACTION = 0.27;
const FIRST_PERSON_COMPASS_LINE_EXTENT = 1.78;
const FIRST_PERSON_COMPASS_LINE = "rgba(199, 220, 211, 0.52)";
const FIRST_PERSON_COMPASS_TEXT = "#dffcff";
const FIRST_PERSON_COMPASS_MUTED = "rgba(195, 213, 205, 0.62)";
const FIRST_PERSON_COMPASS_SHADOW = "rgba(0, 0, 0, 0.74)";
const FIRST_PERSON_COMPASS_NEEDLE = "rgba(240, 200, 75, 0.78)";

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
  health: createImageAsset(new URL("../../assets/game/ui/health_bar.png", import.meta.url).href),
  ammo: createImageAsset(new URL("../../assets/game/ui/ammo_bar.png", import.meta.url).href),
  keys: createImageAsset(new URL("../../assets/game/ui/key_bar_ryb.png", import.meta.url).href),
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

type CompassMarkerOffset = -1 | 0 | 1;
type CompassDirectionLabel = "N" | "E" | "S" | "W";

export type FirstPersonCompassMarker = {
  readonly direction: CardinalDirection;
  readonly label: CompassDirectionLabel;
  readonly offset: CompassMarkerOffset;
  readonly active: boolean;
};

function keySlotRect(x: number, y: number, width: number, height: number): UnitRect {
  return {
    x: x / KEY_BAR_IMAGE_SIZE.width,
    y: y / KEY_BAR_IMAGE_SIZE.height,
    width: width / KEY_BAR_IMAGE_SIZE.width,
    height: height / KEY_BAR_IMAGE_SIZE.height,
  };
}

export type FirstPersonHudOptions = {
  readonly showKeys?: boolean;
  readonly facing?: CardinalDirection;
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

export function renderHud(ctx: CanvasRenderingContext2D, canvasSize: GameCanvasSize, session: GameSession): void {
  const playerState = session.getPlayerState();
  const lines = hudLines(session.map.name, playerState);
  const width = Math.min(HUD_WIDTH, canvasSize.width - HUD_MARGIN * 2);
  if (width <= HUD_PADDING * 2) return;

  const height = lines.length * HUD_LINE_HEIGHT + HUD_PADDING * 2;
  const x = HUD_MARGIN;
  const y = HUD_MARGIN;

  ctx.save();
  ctx.fillStyle = HUD_BACKGROUND;
  ctx.fillRect(x, y, width, height);
  ctx.font = monoFont(400, 14);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  const maxTextWidth = width - HUD_PADDING * 2;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineY = y + HUD_PADDING + HUD_LINE_HEIGHT * i + HUD_LINE_HEIGHT / 2;
    ctx.fillStyle = line.color;
    ctx.fillText(fitText(ctx, line.text, maxTextWidth), x + HUD_PADDING, lineY);
  }

  ctx.restore();
}

export function renderFirstPersonHud(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  playerState: PlayerStateSnapshot,
  options: FirstPersonHudOptions = {},
  onAssetLoad?: () => void,
): void {
  if (options.facing !== undefined) {
    renderFirstPersonCompass(ctx, canvasSize, options.facing);
  }

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
  playerState: PlayerStateSnapshot,
  options: FirstPersonHudOptions = {},
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

export function firstPersonCompassRect(canvasSize: GameCanvasSize): HudRect {
  const availableWidth = Math.max(1, canvasSize.width - HUD_MARGIN * 2);
  const width = Math.min(
    availableWidth,
    Math.max(
      Math.min(FIRST_PERSON_COMPASS_MIN_WIDTH, availableWidth),
      Math.min(FIRST_PERSON_COMPASS_MAX_WIDTH, Math.round(canvasSize.width * FIRST_PERSON_COMPASS_WIDTH_FRACTION)),
    ),
  );
  const height = Math.max(1, Math.min(FIRST_PERSON_COMPASS_HEIGHT, canvasSize.height - HUD_MARGIN * 2));
  return {
    x: Math.round((canvasSize.width - width) / 2),
    y: Math.min(FIRST_PERSON_COMPASS_TOP, Math.max(0, canvasSize.height - height - HUD_MARGIN)),
    width,
    height,
  };
}

export function firstPersonCompassMarkers(facing: CardinalDirection): readonly FirstPersonCompassMarker[] {
  const direction = normalizeDirection(facing);
  return [
    compassMarker(normalizeDirection(direction - 1), -1, false),
    compassMarker(direction, 0, true),
    compassMarker(normalizeDirection(direction + 1), 1, false),
  ];
}

export function renderFirstPersonCompass(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  facing: CardinalDirection,
): void {
  const rect = firstPersonCompassRect(canvasSize);
  if (rect.width <= 0 || rect.height <= 0) return;

  const centerX = rect.x + rect.width / 2;
  const lineY = rect.y + Math.round(rect.height * 0.63);
  const spacing = Math.max(24, Math.round(rect.width * FIRST_PERSON_COMPASS_CARDINAL_SPACING_FRACTION));
  const lineStart = Math.max(rect.x, centerX - spacing * FIRST_PERSON_COMPASS_LINE_EXTENT);
  const lineEnd = Math.min(rect.x + rect.width, centerX + spacing * FIRST_PERSON_COMPASS_LINE_EXTENT);

  ctx.save();
  ctx.lineCap = "round";
  drawCompassLine(ctx, lineStart, lineEnd, lineY);
  drawCompassTicks(ctx, centerX, lineY, spacing);
  drawCompassNeedle(ctx, centerX, lineY);
  drawCompassLabels(ctx, firstPersonCompassMarkers(facing), centerX, spacing, rect.y + 14);
  ctx.restore();
}

function compassMarker(
  direction: CardinalDirection,
  offset: CompassMarkerOffset,
  active: boolean,
): FirstPersonCompassMarker {
  return {
    direction,
    label: directionLabel(direction),
    offset,
    active,
  };
}

function directionLabel(direction: CardinalDirection): CompassDirectionLabel {
  switch (direction) {
    case Direction.North:
      return "N";
    case Direction.East:
      return "E";
    case Direction.South:
      return "S";
    case Direction.West:
      return "W";
  }
}

function drawCompassLine(ctx: CanvasRenderingContext2D, startX: number, endX: number, y: number): void {
  ctx.strokeStyle = FIRST_PERSON_COMPASS_SHADOW;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(startX, y + 1);
  ctx.lineTo(endX, y + 1);
  ctx.stroke();

  ctx.strokeStyle = FIRST_PERSON_COMPASS_LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, y);
  ctx.lineTo(endX, y);
  ctx.stroke();
}

function drawCompassTicks(ctx: CanvasRenderingContext2D, centerX: number, lineY: number, spacing: number): void {
  for (const offset of [-1.5, -1, -0.5, 0.5, 1, 1.5]) {
    const isMajor = Math.abs(offset) === 1;
    const x = centerX + spacing * offset;
    const tickHeight = isMajor ? 16 : 10;
    ctx.strokeStyle = FIRST_PERSON_COMPASS_SHADOW;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, lineY - tickHeight / 2 + 1);
    ctx.lineTo(x, lineY + tickHeight / 2 + 1);
    ctx.stroke();

    ctx.strokeStyle = FIRST_PERSON_COMPASS_LINE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, lineY - tickHeight / 2);
    ctx.lineTo(x, lineY + tickHeight / 2);
    ctx.stroke();
  }
}

function drawCompassNeedle(ctx: CanvasRenderingContext2D, centerX: number, lineY: number): void {
  const radius = 6;
  ctx.fillStyle = FIRST_PERSON_COMPASS_SHADOW;
  ctx.beginPath();
  ctx.moveTo(centerX, lineY - radius + 1);
  ctx.lineTo(centerX + radius, lineY + 1);
  ctx.lineTo(centerX, lineY + radius + 1);
  ctx.lineTo(centerX - radius, lineY + 1);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = FIRST_PERSON_COMPASS_NEEDLE;
  ctx.beginPath();
  ctx.moveTo(centerX, lineY - radius);
  ctx.lineTo(centerX + radius, lineY);
  ctx.lineTo(centerX, lineY + radius);
  ctx.lineTo(centerX - radius, lineY);
  ctx.closePath();
  ctx.fill();
}

function drawCompassLabels(
  ctx: CanvasRenderingContext2D,
  markers: readonly FirstPersonCompassMarker[],
  centerX: number,
  spacing: number,
  y: number,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const marker of markers) {
    const x = centerX + marker.offset * spacing;
    ctx.font = monoFont(marker.active ? 800 : 700, marker.active ? 19 : 17);
    ctx.fillStyle = FIRST_PERSON_COMPASS_SHADOW;
    ctx.fillText(marker.label, x + 1, y + 1);
    ctx.fillStyle = marker.active ? FIRST_PERSON_COMPASS_TEXT : FIRST_PERSON_COMPASS_MUTED;
    ctx.fillText(marker.label, x, y);
  }
}

type HudLine = {
  readonly text: string;
  readonly color: string;
};

function hudLines(mapName: string, playerState: PlayerStateSnapshot): readonly HudLine[] {
  const health = playerState.health;
  const hpText = `HP ${health.current}/${health.max}`;
  const keyText = playerState.heldKeys.length === 0 ? "Keys none" : `Keys ${playerState.heldKeys.join(", ")}`;
  const weaponText = `Weapon ${playerState.selectedWeapon} / owned ${ownedWeaponText(playerState)}`;
  const ammo = playerState.ammo;
  const progress = playerState.progress;

  return [
    { text: mapName, color: HUD_ACCENT },
    {
      text: hpText,
      color: healthColor(health.current, health.max),
    },
    { text: weaponText, color: HUD_TEXT },
    { text: `Ammo P ${ammo.pistol} / C ${ammo.cannon}`, color: ammo.pistol + ammo.cannon === 0 ? HUD_MUTED : HUD_TEXT },
    {
      text: `Credits ${progress.credits} / Score ${progress.score}`,
      color: progress.score === 0 ? HUD_MUTED : HUD_TEXT,
    },
    { text: `XP ${progress.xp}`, color: progress.xp === 0 ? HUD_MUTED : HUD_TEXT },
    { text: keyText, color: playerState.heldKeys.length === 0 ? HUD_MUTED : HUD_TEXT },
    {
      text: playerState.hasUplinkCode ? "Uplink code ready" : "Find uplink code",
      color: playerState.hasUplinkCode ? HUD_TEXT : HUD_MUTED,
    },
  ];
}

function ownedWeaponText(playerState: PlayerStateSnapshot): string {
  return playerState.unlockedWeapons.join(",");
}

function healthColor(current: number, max: number): string {
  if (current <= Math.ceil(max * 0.3)) return HUD_DANGER;
  if (current <= Math.ceil(max * 0.6)) return HUD_WARNING;
  return HUD_TEXT;
}

function selectedWeaponAmmo(
  playerState: PlayerStateSnapshot,
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

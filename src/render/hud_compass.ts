import { type CardinalDirection, Direction, directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { shortestAngleDelta } from "@/src/render/tween.ts";
import { monoFont } from "@/src/render/text.ts";

const HUD_MARGIN = 12;

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
const COMPASS_QUARTER_TURN_RADIANS = Math.PI / 2;
const COMPASS_VISIBLE_OFFSET_LIMIT = FIRST_PERSON_COMPASS_LINE_EXTENT + 0.01;
const COMPASS_ACTIVE_OFFSET_EPSILON = 0.000_001;
const COMPASS_DIRECTIONS = [
  Direction.North,
  Direction.East,
  Direction.South,
  Direction.West,
] as const satisfies readonly CardinalDirection[];

type HudRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type CompassDirectionLabel = "N" | "E" | "S" | "W";

export type FirstPersonCompassMarker = {
  readonly direction: CardinalDirection;
  readonly label: CompassDirectionLabel;
  readonly offset: number;
  readonly active: boolean;
};

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
  return firstPersonCompassMarkersAtAngle(directionAngle(normalizeDirection(facing)));
}

export function firstPersonCompassMarkersAtAngle(angle: number): readonly FirstPersonCompassMarker[] {
  const markers: FirstPersonCompassMarker[] = [];
  for (const direction of COMPASS_DIRECTIONS) {
    const offset = compassMarkerOffset(angle, direction);
    if (Math.abs(offset) <= COMPASS_VISIBLE_OFFSET_LIMIT) {
      markers.push(compassMarker(direction, offset, Math.abs(offset) <= COMPASS_ACTIVE_OFFSET_EPSILON));
    }
  }
  markers.sort((a, b) => a.offset - b.offset);
  return markers;
}

export function renderFirstPersonCompass(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  facing: CardinalDirection,
): void {
  renderFirstPersonCompassAtAngle(ctx, canvasSize, directionAngle(normalizeDirection(facing)));
}

export function renderFirstPersonCompassAtAngle(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  angle: number,
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
  drawCompassLabelsAtAngle(ctx, angle, centerX, spacing, rect.y + 14);
  ctx.restore();
}

function compassMarker(
  direction: CardinalDirection,
  offset: number,
  active: boolean,
): FirstPersonCompassMarker {
  return {
    direction,
    label: directionLabel(direction),
    offset,
    active,
  };
}

function directionAngle(direction: CardinalDirection): number {
  const delta = directionDelta(direction);
  return Math.atan2(delta.dy, delta.dx);
}

function compassMarkerOffset(angle: number, direction: CardinalDirection): number {
  return shortestAngleDelta(angle, directionAngle(direction)) / COMPASS_QUARTER_TURN_RADIANS;
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

function drawCompassLabelsAtAngle(
  ctx: CanvasRenderingContext2D,
  angle: number,
  centerX: number,
  spacing: number,
  y: number,
): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const direction of COMPASS_DIRECTIONS) {
    const offset = compassMarkerOffset(angle, direction);
    if (Math.abs(offset) > COMPASS_VISIBLE_OFFSET_LIMIT) continue;

    const active = Math.abs(offset) <= COMPASS_ACTIVE_OFFSET_EPSILON;
    const label = directionLabel(direction);
    const x = centerX + offset * spacing;
    ctx.font = monoFont(active ? 800 : 700, active ? 19 : 17);
    ctx.fillStyle = FIRST_PERSON_COMPASS_SHADOW;
    ctx.fillText(label, x + 1, y + 1);
    ctx.fillStyle = active ? FIRST_PERSON_COMPASS_TEXT : FIRST_PERSON_COMPASS_MUTED;
    ctx.fillText(label, x, y);
  }
}

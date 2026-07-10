import { type DrawableEntity, DrawableKind, SpriteId } from "@/src/ecs/drawables.ts";
import type { FrameRenderSession } from "@/src/game/session_ports.ts";
import type { PlayerStatusSnapshot } from "@/src/game/state.ts";
import { Direction } from "@/src/grid/direction.ts";
import { createGameMap } from "@/src/map/map.ts";
import { renderDrawableEntities } from "@/src/render/drawables.ts";
import type { MapRenderMetrics } from "@/src/render/map.ts";
import { assertEquals } from "@std/assert";

const METRICS: MapRenderMetrics = {
  mapWidth: 3,
  mapHeight: 3,
  tileSize: 32,
  offsetX: 0,
  offsetY: 0,
};

Deno.test("top-down drawable pass skips decorations and still draws items", () => {
  const ctx = new FakeDrawableContext();
  const drawables: DrawableEntity[] = [
    { kind: DrawableKind.Sprite, entity: 1, x: 1, y: 1, spriteId: SpriteId.DecorCeilingLight },
    { kind: DrawableKind.Sprite, entity: 2, x: 0, y: 1, spriteId: SpriteId.DecorServerPile },
    { kind: DrawableKind.Sprite, entity: 3, x: 2, y: 1, spriteId: SpriteId.HealthPatch },
  ];

  renderDrawableEntities(ctx as unknown as CanvasRenderingContext2D, fakeSession(drawables), METRICS);

  assertEquals(ctx.fillTexts.map(({ text }) => text), ["+"]);
  assertEquals(ctx.fillStyles.includes("#ef4444"), true);
  assertEquals(ctx.fillStyles.includes("#facc15"), false);
  assertEquals(ctx.fillStyles.includes("#64748b"), false);
});

function fakeSession(drawables: readonly DrawableEntity[]): FrameRenderSession {
  return {
    getMap: () =>
      createGameMap("test", [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ], []),
    getPlayerStatus: (): PlayerStatusSnapshot => ({
      heldKeys: [],
      selectedWeapon: 1,
      unlockedWeapons: [1],
      ammo: { pistol: 0, cannon: 0 },
      health: { current: 10, max: 10 },
      hasUplinkCode: false,
      progress: {
        credits: 0,
        score: 0,
        xp: 0,
        levelCredits: 0,
      },
    }),
    getPlayerPosition: () => ({ x: 0, y: 0 }),
    getPlayerFacing: () => ({ dir: Direction.North }),
    getVisibility: () => ({
      isVisible: () => true,
      isExplored: () => true,
    }),
    forEachDrawable: (visit) => {
      for (const drawable of drawables) visit(drawable);
    },
    forEachLight: () => {},
  };
}

class FakeDrawableContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  font = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly fillStyles: string[] = [];
  readonly fillTexts: Array<{ text: string; fillStyle: string }> = [];

  beginPath(): void {}
  closePath(): void {}
  moveTo(_x: number, _y: number): void {}
  lineTo(_x: number, _y: number): void {}
  arc(_x: number, _y: number, _radius: number, _start: number, _end: number): void {}
  fill(): void {
    if (typeof this.fillStyle === "string") this.fillStyles.push(this.fillStyle);
  }
  stroke(): void {}
  fillRect(_x: number, _y: number, _width: number, _height: number): void {
    if (typeof this.fillStyle === "string") this.fillStyles.push(this.fillStyle);
  }
  fillText(text: string, _x: number, _y: number): void {
    this.fillTexts.push({
      text,
      fillStyle: typeof this.fillStyle === "string" ? this.fillStyle : "",
    });
  }
  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics;
  }
}

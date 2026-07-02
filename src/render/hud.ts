import type { GameSession } from "@/src/ecs/session.ts";
import type { PlayerState } from "@/src/game/state.ts";
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

type HudLine = {
  readonly text: string;
  readonly color: string;
};

function hudLines(mapName: string, playerState: PlayerState): readonly HudLine[] {
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
      color: health.current <= Math.ceil(health.max * 0.3) ? HUD_DANGER : HUD_TEXT,
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

function ownedWeaponText(playerState: PlayerState): string {
  return playerState.unlockedWeapons.join(",");
}

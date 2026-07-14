export type LevelStats = {
  readonly elapsedMs: number;
  readonly moves: number;
  readonly monstersKilled: number;
  readonly totalMonsters: number;
};

export function formatLevelStats(stats: LevelStats): string {
  const percentage = stats.totalMonsters === 0 ? 0 : Math.round(stats.monstersKilled / stats.totalMonsters * 100);
  return [
    "LEVEL COMPLETE",
    "",
    `TIME ${formatElapsedTime(stats.elapsedMs)}`,
    `MOVES ${stats.moves}`,
    `MONSTERS ${stats.monstersKilled}/${stats.totalMonsters} (${percentage}%)`,
  ].join("\n");
}

function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

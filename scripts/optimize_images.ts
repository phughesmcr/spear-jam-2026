/**
 * Lossless-ish PNG recompression for large game images (ImageMagick).
 * Usage: deno run -A scripts/optimize_images.ts
 */
const TARGETS = [
  "assets/game/ui/verb_menu_cutout.png",
  "assets/game/ui/weapon_3_active.png",
  "assets/game/ui/weapon_3_idle.png",
  "assets/game/ui/weapon_1_active.png",
  "assets/game/ui/weapon_1_idle.png",
  "assets/game/ui/weapon_2_active.png",
  "assets/game/ui/weapon_2_idle.png",
  "assets/game/ui/d20_faces.png",
  "assets/game/ui/dialogue_john.png",
  "assets/game/ui/combat_stats_box.png",
  "assets/game/sprites/john.png",
  "assets/game/sprites/decor_cyborg.png",
  "assets/game/sprites/decor_server_pile.png",
  "assets/game/sprites/uplink_terminal.png",
  "assets/game/sprites/digital_dog.png",
  "assets/game/sprites/weapon_2.png",
  "assets/game/titlescreen_mobile.png",
  "assets/game/endscreen.png",
  "assets/game/help.png",
  "assets/game/sprites/mainframe_core.png",
  "assets/game/sprites/spear_turret.png",
  "assets/game/sprites/spear_turret_loaded.png",
] as const;

async function main(): Promise<void> {
  let saved = 0;
  for (const path of TARGETS) {
    try {
      await Deno.stat(path);
    } catch {
      console.log(`skip missing ${path}`);
      continue;
    }
    const before = (await Deno.stat(path)).size;
    const tmp = `${path}.opt.png`;
    const result = await new Deno.Command("magick", {
      args: [path, "-strip", "-define", "png:compression-level=9", tmp],
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (!result.success) {
      await Deno.remove(tmp).catch(() => {});
      throw new Error(`magick failed for ${path}`);
    }
    const after = (await Deno.stat(tmp)).size;
    if (after < before) {
      await Deno.rename(tmp, path);
      saved += before - after;
      console.log(`${path}: ${fmt(before)} → ${fmt(after)}`);
    } else {
      await Deno.remove(tmp);
      console.log(`${path}: unchanged (${fmt(before)})`);
    }
  }
  console.log(`saved ${fmt(saved)}`);
}

function fmt(n: number): string {
  return `${(n / 1024).toFixed(1)} KB`;
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  });
}

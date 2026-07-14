import { assertEquals } from "@std/assert";
import { weaponHudSpriteRect } from "@/src/game/presentation/ui/weapon_hud.ts";

Deno.test("weaponHudSpriteRect anchors square weapon sprites to the bottom center", () => {
  assertEquals(weaponHudSpriteRect({ width: 720, height: 1280 }, { width: 1254, height: 1254 }), {
    x: 123,
    y: 725,
    width: 590,
    height: 590,
  });
});

Deno.test("weaponHudSpriteRect preserves wide weapon sprite aspect ratios", () => {
  assertEquals(weaponHudSpriteRect({ width: 720, height: 1280 }, { width: 1448, height: 1086 }), {
    x: 123,
    y: 864,
    width: 590,
    height: 443,
  });
});

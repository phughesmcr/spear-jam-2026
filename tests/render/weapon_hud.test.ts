import { assertEquals } from "@std/assert";
import { weaponHudSpriteRect } from "@/src/render/weapon_hud.ts";

Deno.test("weaponHudSpriteRect anchors square weapon sprites to the bottom center", () => {
  assertEquals(weaponHudSpriteRect({ width: 720, height: 1280 }, { width: 1254, height: 1254 }), {
    x: 15,
    y: 589,
    width: 691,
    height: 691,
  });
});

Deno.test("weaponHudSpriteRect preserves wide weapon sprite aspect ratios", () => {
  assertEquals(weaponHudSpriteRect({ width: 720, height: 1280 }, { width: 1448, height: 1086 }), {
    x: 15,
    y: 762,
    width: 691,
    height: 518,
  });
});

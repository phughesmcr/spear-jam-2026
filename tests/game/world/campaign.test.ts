import { assertEquals, assertThrows } from "@std/assert";
import { SoundId } from "@/src/game/model/sound.ts";
import { TERRAIN_CATALOG } from "@/src/game/world/terrain_palette.ts";
import { loadCampaignContent } from "@/src/game/world/campaign.ts";

Deno.test("loadCampaignContent validates native map content", () => {
  const loaded = loadCampaignContent({
    startMapName: "Fixture",
    maps: [
      {
        name: "Fixture",
        tiles: [[0, 0, 0]],
        entities: [
          { prefab: "player", x: 0, y: 0, dir: 1 },
          { prefab: "uplinkCode", x: 1, y: 0 },
          { prefab: "uplinkTerminal", x: 2, y: 0, goto: "victory" },
          { prefab: "light", x: 1, y: 0, color: "#66ccff", radius: 4, flickerAmount: 0.2, flickerSpeed: 9 },
          { prefab: "sound", x: 1, y: 0, soundId: SoundId.AmbientHum, radius: 5, volume: 0.5 },
        ],
      },
    ],
  });

  assertEquals(loaded.startMapName, "Fixture");
  assertEquals(loaded.gameMaps[0]?.terrain.palette, TERRAIN_CATALOG);
  assertEquals(loaded.gameMaps[0]?.entities, [
    { prefab: "player", x: 0, y: 0, dir: 1 },
    { prefab: "uplinkCode", x: 1, y: 0 },
    { prefab: "uplinkTerminal", x: 2, y: 0, goto: "victory" },
    { prefab: "light", x: 1, y: 0, color: "#66ccff", radius: 4, flickerAmount: 0.2, flickerSpeed: 9 },
    { prefab: "sound", x: 1, y: 0, soundId: SoundId.AmbientHum, radius: 5, volume: 0.5 },
  ]);
});

Deno.test("loadCampaignContent rejects malformed native map content", () => {
  assertThrows(
    () =>
      loadCampaignContent({
        startMapName: "Fixture",
        maps: [
          {
            name: "Fixture",
            palette: "boot_sector",
            tiles: [[0]],
            entities: [],
          },
        ],
      }),
    Error,
    'Unrecognized key: "palette"',
  );

  assertThrows(
    () =>
      loadCampaignContent({
        startMapName: "Fixture",
        maps: [
          {
            name: "Fixture",
            tiles: [[0]],
            entities: [
              { prefab: "player", x: 0, y: 0, dir: 1, goto: "victory" },
            ],
          },
        ],
      }),
    Error,
    'Unrecognized key: "goto"',
  );
});

Deno.test("loadCampaignContent rejects unknown map content ids", () => {
  const invalidEntities = [
    { prefab: "npc", x: 3, y: 0, dir: 3, displayName: "missingName" },
    { prefab: "npc", x: 3, y: 0, dir: 3, displayName: "john", dialogueTreeId: "missingDialogue" },
    { prefab: "npc", x: 3, y: 0, dir: 3, displayName: "john", storyId: "missingStoryTarget" },
    { prefab: "npc", x: 3, y: 0, dir: 3, displayName: "john", onTalkEvent: "missingStoryEvent" },
    { prefab: "enemy", x: 3, y: 0, dir: 3, archetype: "missingEnemy" },
    { prefab: "enemy", x: 3, y: 0, dir: 3, displayName: "missingName" },
    { prefab: "door", x: 3, y: 0, examineTextId: "missingExamineText" },
  ];

  for (const entity of invalidEntities) {
    assertThrows(
      () => loadCampaignContent(campaignWith(entity)),
      Error,
      "Invalid campaign content",
    );
  }
});

function campaignWith(entity: Record<string, unknown>): unknown {
  return {
    startMapName: "Fixture",
    maps: [
      {
        name: "Fixture",
        tiles: [[0, 0, 0, 0]],
        entities: [
          { prefab: "player", x: 0, y: 0, dir: 1 },
          { prefab: "uplinkCode", x: 1, y: 0 },
          { prefab: "uplinkTerminal", x: 2, y: 0, goto: "victory" },
          entity,
        ],
      },
    ],
  };
}

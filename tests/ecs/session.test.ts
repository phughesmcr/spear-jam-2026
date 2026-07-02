import { assertEquals, assertRejects } from "@std/assert";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  AttackFacingRequirement,
  AttackPattern,
  AttackTargetMode,
  Blocking,
  Health,
  ItemKind,
  Locked,
} from "@/src/ecs/components.ts";
import { GridPos } from "@/src/ecs/components.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createGameSession } from "@/src/ecs/session.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
import {
  createTestDoor,
  createTestEnemy,
  createTestItem,
  createTestKey,
  createTestNpc,
  createTestPlayer,
  createTestSession,
  createTestUplinkCode,
  createTestUplinkTerminal,
  createTestWeaponPickup,
  flatTestMap,
} from "@/tests/ecs/helpers.ts";

Deno.test("interacting with an NPC enters dialogue without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  createTestNpc(world, {
    x: 2,
    y: 1,
    displayName: DisplayName.John,
    dialogueTreeId: DialogueTreeId.JohnIntro,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [],
    dialogue: {
      title: "John",
      message: "Stay sharp. Space to continue.",
    },
  });
});

Deno.test("interacting with an NPC without dialogue data falls back to silence", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  createTestNpc(world, {
    x: 2,
    y: 1,
    displayName: DisplayName.John,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [],
    dialogue: {
      title: "John",
      message: "John stayed silent. Space to continue.",
    },
  });
});

Deno.test("moving onto a key emits a pickup event and stores that key color", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const key = createTestKey(world, { x: 2, y: 1, color: KeyColor.Red });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(result.events, [
    {
      type: "keyPickedUp",
      entity: key,
    },
  ]);
  assertEquals(world.entities.isActive(key), false);
  assertEquals(session.getPlayerState().heldKeys, [KeyColor.Red]);
});

Deno.test("moving onto an uplink code emits a pickup event and stores the code", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const code = createTestUplinkCode(world, { x: 2, y: 1 });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(result.events, [
    {
      type: "uplinkCodePickedUp",
      entity: code,
    },
  ]);
  assertEquals(world.entities.isActive(code), false);
  assertEquals(session.getPlayerState().hasUplinkCode, true);
});

Deno.test("moving onto a weapon pickup unlocks that weapon", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const weapon = createTestWeaponPickup(world, { x: 2, y: 1, slot: 2 });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(result.events, [
    {
      type: "weaponPickedUp",
      entity: weapon,
      slot: 2,
      label: "Pistol",
    },
  ]);
  assertEquals(world.entities.isActive(weapon), false);
  assertEquals(session.getPlayerState().unlockedWeapons, [1, 2]);
});

Deno.test("moving onto a health patch restores health up to max", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, { health: { current: 4, max: 10 } });
  const patch = createTestItem(world, { x: 2, y: 1, kind: ItemKind.HealthPatch, amount: 8 });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(result.events, [
    {
      type: "healthPickedUp",
      entity: patch,
      amount: 8,
      healed: 6,
    },
  ]);
  assertEquals(world.entities.isActive(patch), false);
  assertEquals(session.getPlayerState().health, { current: 10, max: 10 });
});

Deno.test("moving onto ammo stores it in player state", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const ammo = createTestItem(world, { x: 2, y: 1, kind: ItemKind.PistolAmmo, amount: 5 });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(result.events, [
    {
      type: "ammoPickedUp",
      entity: ammo,
      ammo: "pistol",
      amount: 5,
    },
  ]);
  assertEquals(world.entities.isActive(ammo), false);
  assertEquals(session.getPlayerState().ammo, { pistol: 5, cannon: 0 });
});

Deno.test("interacting with a locked door emits an event without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const door = createTestDoor(world, {
    x: 2,
    y: 1,
    color: KeyColor.Red,
    blocking: true,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [
      {
        type: "doorLocked",
        entity: door,
      },
    ],
  });
  assertEquals(world.components.entityHas(Blocking, door), true);
});

Deno.test("a differently colored key does not open a locked door", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const door = createTestDoor(world, {
    x: 2,
    y: 1,
    color: KeyColor.Blue,
    blocking: true,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity, TEST_MAP, {
    playerState: { heldKeys: [KeyColor.Red], selectedWeapon: 1 },
  });

  const result = session.handlePlayerCommand({ type: "interact" });
  assertEquals(result.events, [{ type: "doorLocked", entity: door }]);
  assertEquals(world.components.entityHas(Locked, door), true);
});

Deno.test("opening a locked door keeps the key color until level exit", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const door = createTestDoor(world, {
    x: 2,
    y: 1,
    color: KeyColor.Red,
    blocking: true,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity, TEST_MAP, {
    playerState: { heldKeys: [KeyColor.Red], selectedWeapon: 1 },
  });

  const openResult = session.handlePlayerCommand({ type: "interact" });
  assertEquals(openResult.events, [
    {
      type: "doorOpened",
      entity: door,
    },
  ]);
  assertEquals(world.components.entityHas(Blocking, door), false);
  assertEquals(session.getPlayerState().heldKeys, [KeyColor.Red]);

  const moveResult = session.handlePlayerCommand({ type: "move", direction: "forward" });
  assertEquals(moveResult.events, []);
  assertEquals(world.components.getEntityData(GridPos, playerEntity), { x: 2, y: 1 });
});

Deno.test("interacting with an uplink terminal without a code emits an event without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const terminal = createTestUplinkTerminal(world, {
    x: 2,
    y: 1,
    blocking: true,
    interactable: true,
  });
  const map = flatTestMap(3, 2, [{ prefab: "uplinkTerminal", x: 2, y: 1, goto: "Next Map" }]);

  const session = createTestSession(world, playerEntity, map);
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [
      {
        type: "uplinkTerminalLocked",
        entity: terminal,
      },
    ],
  });
  assertEquals(session.getPlayerState().hasUplinkCode, false);
});

Deno.test("interacting with an uplink terminal after collecting a code advances the level", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, { health: { current: 4, max: 10 } });
  const terminal = createTestUplinkTerminal(world, {
    x: 2,
    y: 1,
    blocking: true,
    interactable: true,
  });
  const map = flatTestMap(3, 2, [{ prefab: "uplinkTerminal", x: 2, y: 1, goto: "Next Map" }]);
  const session = createTestSession(world, playerEntity, map, {
    playerState: {
      heldKeys: [KeyColor.Red],
      selectedWeapon: 2,
      unlockedWeapons: [1, 2],
      hasUplinkCode: true,
    },
  });

  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [
      {
        type: "uplinkTerminalActivated",
        entity: terminal,
      },
    ],
    mapChange: { goto: "Next Map" },
  });
  assertEquals(session.getPlayerState(), {
    heldKeys: [],
    selectedWeapon: 2,
    unlockedWeapons: [1, 2],
    ammo: { pistol: 0, cannon: 0 },
    health: { current: 4, max: 10 },
    hasUplinkCode: false,
  });
});

Deno.test("createGameSession wires map-defined uplink codes and terminals", async () => {
  const map = flatTestMap(4, 2, [
    { prefab: "player", x: 1, y: 1, dir: 1 },
    { prefab: "uplinkCode", x: 2, y: 1 },
    { prefab: "weaponPickup", x: 3, y: 1, slot: 2 },
    { prefab: "uplinkTerminal", x: 3, y: 0, goto: "Next Map" },
  ]);
  const session = await createGameSession(map, () => 0);

  const pickup = session.handlePlayerCommand({ type: "move", direction: "forward" });
  assertEquals(pickup.events.map((event) => event.type), ["uplinkCodePickedUp"]);
  assertEquals(session.getPlayerState().hasUplinkCode, true);

  const weaponPickup = session.handlePlayerCommand({ type: "move", direction: "forward" });
  assertEquals(weaponPickup.events.map((event) => event.type), ["weaponPickedUp"]);
  assertEquals(session.getPlayerState().unlockedWeapons, [1, 2]);

  session.handlePlayerCommand({ type: "turn", direction: "left" });
  const activation = session.handlePlayerCommand({ type: "interact" });
  assertEquals(activation.events.map((event) => event.type), ["uplinkTerminalActivated"]);
  assertEquals(activation.mapChange, { goto: "Next Map" });
});

Deno.test("selecting a locked weapon emits a player-facing event without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "selectWeapon", slot: 2 });

  assertEquals(result, {
    events: [
      {
        type: "weaponUnavailable",
        slot: 2,
        label: "Pistol",
      },
    ],
  });
  assertEquals(session.getPlayerState().selectedWeapon, 1);
});

Deno.test("selecting an unlocked weapon emits a player-facing event without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);

  const session = createTestSession(world, playerEntity, TEST_MAP, {
    playerState: { heldKeys: [], selectedWeapon: 1, unlockedWeapons: [1, 2] },
  });
  const result = session.handlePlayerCommand({ type: "selectWeapon", slot: 2 });

  assertEquals(result, {
    events: [
      {
        type: "weaponSelected",
        slot: 2,
        label: "Pistol",
      },
    ],
  });
  assertEquals(session.getPlayerState().selectedWeapon, 2);
});

Deno.test("attacking with an empty ranged weapon emits no ammo without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    blocking: true,
    health: { current: 2, max: 2 },
  });
  createTestEnemy(world, {
    x: 2,
    y: 1,
    dir: 3,
    displayName: DisplayName.Imp,
    health: { current: 3, max: 3 },
    attack: {
      minDamage: 1,
      maxDamage: 1,
      range: 1,
      requiresFacing: AttackFacingRequirement.Required,
      attackBonus: 20,
      critThreshold: 0,
      critMultiplier: 1,
      pattern: AttackPattern.Line,
      targets: AttackTargetMode.First,
    },
  });
  const session = createTestSession(world, playerEntity, TEST_MAP, {
    playerState: {
      heldKeys: [],
      selectedWeapon: 2,
      unlockedWeapons: [1, 2],
      ammo: { pistol: 0, cannon: 0 },
    },
  });

  const result = session.handlePlayerCommand({ type: "attack" });

  assertEquals(result, { events: [{ type: "noAmmo", ammo: "pistol" }] });
  assertEquals(session.getPlayerState().health, { current: 2, max: 2 });
});

Deno.test("attacking with a ranged weapon spends ammo before resolving combat", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, { blocking: true, tag: true });
  const enemy = createTestEnemy(world, {
    x: 2,
    y: 1,
    dir: 3,
    displayName: DisplayName.Imp,
    health: { current: 3, max: 3 },
    attack: {
      minDamage: 1,
      maxDamage: 1,
      range: 1,
      requiresFacing: AttackFacingRequirement.Required,
      attackBonus: 20,
      critThreshold: 0,
      critMultiplier: 1,
      pattern: AttackPattern.Line,
      targets: AttackTargetMode.First,
    },
  });
  const session = createTestSession(world, playerEntity, TEST_MAP, {
    random: () => 0.999,
    playerState: {
      heldKeys: [],
      selectedWeapon: 2,
      unlockedWeapons: [1, 2],
      ammo: { pistol: 1, cannon: 0 },
    },
  });

  const result = session.handlePlayerCommand({ type: "attack" });

  assertEquals(result.events, [
    { type: "ammoSpent", ammo: "pistol", amount: 1 },
    {
      type: "damageDealt",
      actor: playerEntity,
      actorName: "You",
      target: enemy,
      targetName: "Imp",
      amount: 6,
      critical: true,
    },
    {
      type: "entityDefeated",
      actor: playerEntity,
      entity: enemy,
      entityName: "Imp",
    },
    {
      type: "creditsEarned",
      amount: 10,
      credits: 10,
      score: 10,
    },
  ]);
  assertEquals(session.getPlayerState().ammo, { pistol: 0, cannon: 0 });
  assertEquals(session.getPlayerState().progress, { credits: 10, score: 10, xp: 0, levelCredits: 10 });
});

Deno.test("attacking empty space with a ranged weapon still spends ammo", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, { blocking: true, tag: true });
  const session = createTestSession(world, playerEntity, TEST_MAP, {
    playerState: {
      heldKeys: [],
      selectedWeapon: 2,
      unlockedWeapons: [1, 2],
      ammo: { pistol: 1, cannon: 0 },
    },
  });

  const result = session.handlePlayerCommand({ type: "attack" });

  assertEquals(result.events, [
    { type: "ammoSpent", ammo: "pistol", amount: 1 },
    {
      type: "attackMissed",
      actor: playerEntity,
      actorName: "You",
    },
  ]);
  assertEquals(session.getPlayerState().ammo, { pistol: 0, cannon: 0 });
});

Deno.test("turning changes facing without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    blocking: true,
    health: { current: 2, max: 2 },
  });
  createTestEnemy(world, {
    x: 2,
    y: 1,
    dir: 3,
    displayName: DisplayName.Imp,
    attack: {
      minDamage: 1,
      maxDamage: 1,
      range: 1,
      requiresFacing: AttackFacingRequirement.Required,
      attackBonus: 20,
      critThreshold: 0,
      critMultiplier: 1,
      pattern: AttackPattern.Line,
      targets: AttackTargetMode.First,
    },
  });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "turn", direction: "right" });

  assertEquals(result, { events: [] });
  assertEquals(session.player.getFacing(), { dir: 2 });
  assertEquals(session.getPlayerState().health, { current: 2, max: 2 });
});

Deno.test("interacting with an uplink terminal linked to victory reports a victory outcome", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const terminal = createTestUplinkTerminal(world, {
    x: 2,
    y: 1,
    blocking: true,
    interactable: true,
  });

  const map = flatTestMap(3, 2, [{ prefab: "uplinkTerminal", x: 2, y: 1, goto: VICTORY_GOTO }]);
  const session = createTestSession(world, playerEntity, map, {
    playerState: { heldKeys: [], selectedWeapon: 1, unlockedWeapons: [1], hasUplinkCode: true },
  });
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [
      {
        type: "uplinkTerminalActivated",
        entity: terminal,
      },
    ],
    outcome: "victory",
  });
});

Deno.test("activating an uplink terminal converts level credits to XP", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const terminal = createTestUplinkTerminal(world, {
    x: 2,
    y: 1,
    blocking: true,
    interactable: true,
  });
  const map = flatTestMap(3, 2, [{ prefab: "uplinkTerminal", x: 2, y: 1, goto: "Next Map" }]);
  const session = createTestSession(world, playerEntity, map, {
    playerState: {
      heldKeys: [KeyColor.Red],
      selectedWeapon: 1,
      hasUplinkCode: true,
      progress: { credits: 20, score: 20, xp: 5, levelCredits: 20 },
    },
  });

  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [
      {
        type: "uplinkTerminalActivated",
        entity: terminal,
      },
      {
        type: "xpGained",
        amount: 20,
        xp: 25,
      },
    ],
    mapChange: { goto: "Next Map" },
  });
  assertEquals(session.getPlayerState().progress, { credits: 20, score: 20, xp: 25, levelCredits: 0 });
  assertEquals(session.getPlayerState().heldKeys, []);
  assertEquals(session.getPlayerState().hasUplinkCode, false);
});

Deno.test("an enemy reducing the player to zero health reports a defeat outcome", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    blocking: true,
    tag: true,
    health: { current: 1, max: 1 },
  });
  const enemy = createTestEnemy(world, {
    x: 2,
    y: 1,
    dir: 3,
    displayName: DisplayName.Imp,
    attack: {
      minDamage: 1,
      maxDamage: 1,
      range: 1,
      requiresFacing: AttackFacingRequirement.Required,
      attackBonus: 20,
      critThreshold: 0,
      critMultiplier: 1,
      pattern: AttackPattern.Line,
      targets: AttackTargetMode.First,
    },
  });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "wait" });

  assertEquals(result.outcome, "defeat");
  assertEquals(result.events, [
    {
      type: "damageDealt",
      actor: enemy,
      actorName: "Imp",
      target: playerEntity,
      targetName: "You",
      amount: 1,
      critical: false,
    },
    {
      type: "entityDefeated",
      actor: enemy,
      entity: playerEntity,
      entityName: "You",
    },
  ]);
  assertEquals(world.entities.isActive(playerEntity), true);
  assertEquals(session.getPlayerState().health, { current: 0, max: 1 });
});

const TEST_MAP = flatTestMap(3, 2);

Deno.test("createGameSession applies carried-over player health", async () => {
  const map = flatTestMap(3, 2, [{ prefab: "player", x: 1, y: 1, dir: 1 }]);
  const session = await createGameSession(map, () => 0, {
    heldKeys: [],
    selectedWeapon: 1,
    health: { current: 3, max: 10 },
  });

  assertEquals(
    session.world.components.getEntityData(Health, session.player.getEntity()),
    { current: 3, max: 10 },
  );
  assertEquals(session.getPlayerState().health, { current: 3, max: 10 });
});

Deno.test("createGameSession spawns the player at full health without carried state", async () => {
  const map = flatTestMap(3, 2, [{ prefab: "player", x: 1, y: 1, dir: 1 }]);
  const session = await createGameSession(map, () => 0);

  assertEquals(session.getPlayerState().health, { current: 10, max: 10 });
});

Deno.test("createGameSession rejects maps without a player spawn", async () => {
  await assertRejects(() => createGameSession(flatTestMap(3, 2), () => 0), Error, "player spawn");
});

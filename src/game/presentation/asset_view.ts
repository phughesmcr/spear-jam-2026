import { createImageAsset, type ImageAsset } from "@/src/engine/canvas/mod.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import type { WeaponHudPhase } from "@/src/game/model/presentation_state.ts";
import type { CommandSlot } from "@/src/game/model/state.ts";
import { type VerbId, VERBS } from "@/src/game/model/verbs.ts";
import type { FirstPersonAssetView } from "@/src/game/presentation/first_person/assets/mod.ts";

const WEAPON_SLOTS = [1, 2, 3] as const satisfies readonly CommandSlot[];
const WEAPON_PHASES = ["idle", "active"] as const satisfies readonly WeaponHudPhase[];

const WEAPON_HUD_SOURCES: Readonly<Record<CommandSlot, Readonly<Record<WeaponHudPhase, string>>>> = {
  1: {
    idle: new URL("../../../assets/game/ui/weapon_1_idle.png", import.meta.url).href,
    active: new URL("../../../assets/game/ui/weapon_1_active.png", import.meta.url).href,
  },
  2: {
    idle: new URL("../../../assets/game/ui/weapon_2_idle.png", import.meta.url).href,
    active: new URL("../../../assets/game/ui/weapon_2_active.png", import.meta.url).href,
  },
  3: {
    idle: new URL("../../../assets/game/ui/weapon_3_idle.png", import.meta.url).href,
    active: new URL("../../../assets/game/ui/weapon_3_active.png", import.meta.url).href,
  },
};

const VERB_GLOW_SOURCES: Readonly<Record<VerbId, string>> = {
  attack: new URL("../../../assets/game/ui/verb_menu_glow_attack.png", import.meta.url).href,
  use: new URL("../../../assets/game/ui/verb_menu_glow_use.png", import.meta.url).href,
  open: new URL("../../../assets/game/ui/verb_menu_glow_open.png", import.meta.url).href,
  examine: new URL("../../../assets/game/ui/verb_menu_glow_examine.png", import.meta.url).href,
  talk: new URL("../../../assets/game/ui/verb_menu_glow_talk.png", import.meta.url).href,
};

export type HudAssets = {
  readonly health: ImageAsset;
  readonly ammo: ImageAsset;
  readonly keys: ImageAsset;
};

export type WeaponHudAssets = Readonly<
  Record<CommandSlot, Readonly<Record<WeaponHudPhase, ImageAsset>>>
>;

export type DialogueAssets = {
  readonly portraits: Readonly<Partial<Record<DisplayName, ImageAsset>>>;
  readonly spearReveal: ImageAsset;
};

export type CombatFeedbackAssets = {
  readonly panel: ImageAsset;
  readonly d20Faces: ImageAsset;
};

export type VerbMenuAssets = {
  readonly sprite: ImageAsset;
  readonly glows: Readonly<Record<VerbId, ImageAsset>>;
};

export type PresentationUiAssets = {
  readonly title: { readonly background: ImageAsset };
  readonly help: { readonly guide: ImageAsset };
  readonly hud: HudAssets;
  readonly weaponHud: WeaponHudAssets;
  readonly dialogue: DialogueAssets;
  readonly combatFeedback: CombatFeedbackAssets;
  readonly intermission: { readonly victoryBackground: ImageAsset };
  readonly verbMenu: VerbMenuAssets;
};

export type PresentationAssetView = {
  readonly ui: PresentationUiAssets;
  readonly firstPerson: FirstPersonAssetView;
};

export function createPresentationAssetView(firstPerson: FirstPersonAssetView): PresentationAssetView {
  return Object.freeze({ ui: createPresentationUiAssets(), firstPerson });
}

export function createPresentationUiAssets(): PresentationUiAssets {
  const weaponHud = Object.fromEntries(
    WEAPON_SLOTS.map((slot) => [
      slot,
      Object.freeze(Object.fromEntries(
        WEAPON_PHASES.map((phase) => [
          phase,
          createImageAsset(WEAPON_HUD_SOURCES[slot][phase]),
        ]),
      )) as Readonly<Record<WeaponHudPhase, ImageAsset>>,
    ]),
  ) as Record<CommandSlot, Readonly<Record<WeaponHudPhase, ImageAsset>>>;
  const glows = Object.fromEntries(
    VERBS.map((verb) => [verb.id, createImageAsset(VERB_GLOW_SOURCES[verb.id])]),
  ) as Record<VerbId, ImageAsset>;

  return Object.freeze({
    title: Object.freeze({
      background: createImageAsset(new URL("../../../assets/game/titlescreen_mobile.png", import.meta.url).href),
    }),
    help: Object.freeze({
      guide: createImageAsset(new URL("../../../assets/game/help.png", import.meta.url).href),
    }),
    hud: Object.freeze({
      health: createImageAsset(new URL("../../../assets/game/ui/health_bar.png", import.meta.url).href),
      ammo: createImageAsset(new URL("../../../assets/game/ui/ammo_bar.png", import.meta.url).href),
      keys: createImageAsset(new URL("../../../assets/game/ui/key_bar_ryb.png", import.meta.url).href),
    }),
    weaponHud: Object.freeze(weaponHud),
    dialogue: Object.freeze({
      portraits: Object.freeze({
        [DisplayName.John]: createImageAsset(
          new URL("../../../assets/game/ui/dialogue_john.png", import.meta.url).href,
        ),
      }),
      spearReveal: createImageAsset(new URL("../../../assets/game/ui/spear_reveal.png", import.meta.url).href),
    }),
    combatFeedback: Object.freeze({
      panel: createImageAsset(new URL("../../../assets/game/ui/combat_stats_box.png", import.meta.url).href),
      d20Faces: createImageAsset(new URL("../../../assets/game/ui/d20_faces.png", import.meta.url).href),
    }),
    intermission: Object.freeze({
      victoryBackground: createImageAsset(new URL("../../../assets/game/endscreen.png", import.meta.url).href),
    }),
    verbMenu: Object.freeze({
      sprite: createImageAsset(new URL("../../../assets/game/ui/verb_menu_cutout.png", import.meta.url).href),
      glows: Object.freeze(glows),
    }),
  });
}

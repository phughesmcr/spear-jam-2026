import bootSector from "@/src/game/content/maps/boot_sector.json" with { type: "json" };
import dataConduit from "@/src/game/content/maps/data_conduit.json" with { type: "json" };
import firewall from "@/src/game/content/maps/firewall.json" with { type: "json" };
import mainframeCore from "@/src/game/content/maps/mainframe_core.json" with { type: "json" };
import theNexus from "@/src/game/content/maps/the_nexus.json" with { type: "json" };
import { compileGameCatalog, type GameCatalog, type GameCatalogSource } from "@/src/game/content/catalog.ts";
import { SHIPPED_DIALOGUE_SOURCE } from "@/src/game/content/source/dialogue.ts";
import { SHIPPED_LEVEL_MUSIC, SHIPPED_MUSIC_TRACKS } from "@/src/game/content/source/music.ts";
import { SHIPPED_PRESENTATION_SOURCE } from "@/src/game/content/source/presentation.ts";
import { SHIPPED_SIMULATION_SOURCE } from "@/src/game/content/source/simulation.ts";
import { SHIPPED_SOUND_ENTRIES } from "@/src/game/content/source/sounds.ts";
import { SHIPPED_VOICE_SOURCES } from "@/src/game/content/source/voices.ts";

const SHIPPED_SOURCE = {
  campaign: {
    startMapName: bootSector.name,
    maps: [bootSector, dataConduit, firewall, theNexus, mainframeCore],
  },
  musicByMap: SHIPPED_LEVEL_MUSIC,
  simulation: SHIPPED_SIMULATION_SOURCE,
  dialogue: SHIPPED_DIALOGUE_SOURCE,
  audio: {
    tracks: SHIPPED_MUSIC_TRACKS,
    sounds: SHIPPED_SOUND_ENTRIES,
    voices: SHIPPED_VOICE_SOURCES,
  },
  presentation: SHIPPED_PRESENTATION_SOURCE,
} as const satisfies GameCatalogSource;

export const SHIPPED_GAME: GameCatalog = compileGameCatalog(SHIPPED_SOURCE);

import bootSector from "@/src/game/content/maps/boot_sector.json" with { type: "json" };
import dataConduit from "@/src/game/content/maps/data_conduit.json" with { type: "json" };
import firewall from "@/src/game/content/maps/firewall.json" with { type: "json" };
import mainframeCore from "@/src/game/content/maps/mainframe_core.json" with { type: "json" };
import theNexus from "@/src/game/content/maps/the_nexus.json" with { type: "json" };

export const CAMPAIGN_CONTENT = {
  startMapName: bootSector.name,
  maps: [bootSector, dataConduit, firewall, theNexus, mainframeCore],
};

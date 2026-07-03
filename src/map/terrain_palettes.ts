import { TexturePack } from "@/src/map/map.ts";
import type { TerrainTile } from "@/src/map/map.ts";

export const BOOT_SECTOR_PALETTE: readonly TerrainTile[] = [
  {
    id: 0,
    color: "#0b5152",
    floor_texture: `${TexturePack.Pack1}:1,3`,
    ceiling_texture: `${TexturePack.Pack1}:2,0`,
  },
  {
    id: 2,
    color: "#1f5a30",
    floor_texture: `${TexturePack.Pack1}:0,3`,
    ceiling_texture: `${TexturePack.Pack1}:1,2`,
  },
  {
    id: 3,
    color: "#694b1f",
    floor_texture: `${TexturePack.Pack1}:3,3`,
    ceiling_texture: `${TexturePack.Pack1}:3,3`,
  },
  { id: 1, color: "#185757", wall_texture: `${TexturePack.Pack1}:0,2`, blocking: true },
  { id: 4, color: "#5f4f31", wall_texture: `${TexturePack.Pack1}:2,1`, blocking: true },
  { id: 5, color: "#304757", wall_texture: `${TexturePack.Pack1}:3,2`, blocking: true },
];

export const DATA_CONDUIT_PALETTE: readonly TerrainTile[] = [
  {
    id: 0,
    color: "#12555d",
    floor_texture: `${TexturePack.Pack2}:2,1`,
    ceiling_texture: `${TexturePack.Pack2}:3,0`,
  },
  {
    id: 2,
    color: "#6a4c17",
    floor_texture: `${TexturePack.Pack2}:0,1`,
    ceiling_texture: `${TexturePack.Pack2}:4,0`,
  },
  {
    id: 3,
    color: "#6a3224",
    floor_texture: `${TexturePack.Pack2}:3,1`,
    ceiling_texture: `${TexturePack.Pack2}:4,3`,
  },
  { id: 1, color: "#174f47", wall_texture: `${TexturePack.Pack2}:0,0`, blocking: true },
  { id: 4, color: "#225257", wall_texture: `${TexturePack.Pack2}:2,0`, blocking: true },
  { id: 5, color: "#4d5f1f", wall_texture: `${TexturePack.Pack2}:4,1`, blocking: true },
];

export const FIREWALL_PALETTE: readonly TerrainTile[] = [
  {
    id: 0,
    color: "#6f4a12",
    floor_texture: `${TexturePack.Pack2}:0,1`,
    ceiling_texture: `${TexturePack.Pack2}:4,0`,
  },
  {
    id: 2,
    color: "#7c3422",
    floor_texture: `${TexturePack.Pack2}:3,1`,
    ceiling_texture: `${TexturePack.Pack2}:3,0`,
  },
  {
    id: 3,
    color: "#254f51",
    floor_texture: `${TexturePack.Pack2}:2,1`,
    ceiling_texture: `${TexturePack.Pack2}:2,3`,
  },
  { id: 1, color: "#5a2e1c", wall_texture: `${TexturePack.Pack2}:3,1`, blocking: true },
  { id: 4, color: "#475c20", wall_texture: `${TexturePack.Pack2}:4,1`, blocking: true },
  { id: 5, color: "#21484b", wall_texture: `${TexturePack.Pack2}:2,0`, blocking: true },
];

export const NEXUS_PALETTE: readonly TerrainTile[] = [
  {
    id: 0,
    color: "#31451b",
    floor_texture: `${TexturePack.Pack3}:3,2`,
    ceiling_texture: `${TexturePack.Pack3}:0,2`,
  },
  {
    id: 2,
    color: "#60472f",
    floor_texture: `${TexturePack.Pack3}:2,1`,
    ceiling_texture: `${TexturePack.Pack3}:4,2`,
  },
  {
    id: 3,
    color: "#4a4433",
    floor_texture: `${TexturePack.Pack3}:0,3`,
    ceiling_texture: `${TexturePack.Pack3}:2,0`,
  },
  { id: 1, color: "#133327", wall_texture: `${TexturePack.Pack3}:1,0`, blocking: true },
  { id: 4, color: "#201713", wall_texture: `${TexturePack.Pack3}:4,0`, blocking: true },
  { id: 5, color: "#112c25", wall_texture: `${TexturePack.Pack3}:0,1`, blocking: true },
];

export const MAINFRAME_CORE_PALETTE: readonly TerrainTile[] = [
  {
    id: 0,
    color: "#4c3424",
    floor_texture: `${TexturePack.Pack3}:2,3`,
    ceiling_texture: `${TexturePack.Pack3}:0,3`,
  },
  {
    id: 2,
    color: "#31451b",
    floor_texture: `${TexturePack.Pack3}:3,2`,
    ceiling_texture: `${TexturePack.Pack3}:0,2`,
  },
  {
    id: 3,
    color: "#4a4433",
    floor_texture: `${TexturePack.Pack3}:0,3`,
    ceiling_texture: `${TexturePack.Pack3}:4,2`,
  },
  { id: 1, color: "#201713", wall_texture: `${TexturePack.Pack3}:4,0`, blocking: true },
  { id: 4, color: "#112c25", wall_texture: `${TexturePack.Pack3}:1,0`, blocking: true },
  { id: 5, color: "#442116", wall_texture: `${TexturePack.Pack3}:4,3`, blocking: true },
];

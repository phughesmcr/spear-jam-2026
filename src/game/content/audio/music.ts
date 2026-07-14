export const TrackId = {
  Title: "title",
  Intro: "intro",
  Map1: "map1",
  Map2: "map2",
  Map3: "map3",
  Map4: "map4",
  Map5: "map5",
} as const;
export type TrackId = (typeof TrackId)[keyof typeof TrackId];

export type MusicTrack = {
  readonly src: string;
  readonly volume: number;
  readonly loop: boolean;
};

export const MUSIC_TRACKS: Readonly<Record<TrackId, MusicTrack>> = {
  [TrackId.Title]: track(new URL("../../../../assets/game/music/titlescreen.mp3", import.meta.url).href),
  [TrackId.Intro]: track(new URL("../../../../assets/game/music/intro.mp3", import.meta.url).href),
  [TrackId.Map1]: track(new URL("../../../../assets/game/music/map_1.mp3", import.meta.url).href),
  [TrackId.Map2]: track(new URL("../../../../assets/game/music/map_2.mp3", import.meta.url).href),
  [TrackId.Map3]: track(new URL("../../../../assets/game/music/map_3.mp3", import.meta.url).href),
  [TrackId.Map4]: track(new URL("../../../../assets/game/music/map_4.mp3", import.meta.url).href),
  [TrackId.Map5]: track(new URL("../../../../assets/game/music/map_5.mp3", import.meta.url).href),
};

const MAP_TRACKS: Readonly<Record<string, TrackId>> = {
  "Boot Sector": TrackId.Map1,
  "Data Conduit": TrackId.Map2,
  "Firewall": TrackId.Map3,
  "The Nexus": TrackId.Map4,
  "Mainframe Core": TrackId.Map5,
};

export function musicTrackForMap(mapName: string): TrackId {
  const trackId = MAP_TRACKS[mapName];
  if (trackId === undefined) throw new Error(`Map "${mapName}" has no music track.`);
  return trackId;
}

function track(src: string): MusicTrack {
  return {
    src,
    volume: 0.55,
    loop: true,
  };
}

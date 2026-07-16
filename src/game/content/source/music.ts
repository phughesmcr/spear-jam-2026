import { type MusicTrack, TrackId } from "@/src/game/content/audio/music.ts";

export const SHIPPED_MUSIC_TRACKS: Readonly<Record<TrackId, MusicTrack>> = {
  [TrackId.Title]: track(new URL("../../../../assets/game/music/titlescreen.mp3", import.meta.url).href),
  [TrackId.Intro]: track(new URL("../../../../assets/game/music/intro.mp3", import.meta.url).href),
  [TrackId.Map1]: track(new URL("../../../../assets/game/music/map_1.mp3", import.meta.url).href),
  [TrackId.Map2]: track(new URL("../../../../assets/game/music/map_2.mp3", import.meta.url).href),
  [TrackId.Map3]: track(new URL("../../../../assets/game/music/map_3.mp3", import.meta.url).href),
  [TrackId.Map4]: track(new URL("../../../../assets/game/music/map_4.mp3", import.meta.url).href),
  [TrackId.Map5]: track(new URL("../../../../assets/game/music/map_5.mp3", import.meta.url).href),
};

export const SHIPPED_LEVEL_MUSIC: Readonly<Record<string, TrackId>> = {
  "Boot Sector": TrackId.Map1,
  "Data Conduit": TrackId.Map2,
  "Firewall": TrackId.Map3,
  "The Nexus": TrackId.Map4,
  "Mainframe Core": TrackId.Map5,
};

function track(src: string): MusicTrack {
  return { src, volume: 0.55, loop: true };
}

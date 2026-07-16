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

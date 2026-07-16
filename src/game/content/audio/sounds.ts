import type { SoundId } from "@/src/game/model/sound.ts";

export type SoundCategory = "ambient" | "sfx";

export type SoundCatalogEntry = {
  readonly soundId: SoundId;
  readonly src: string;
  readonly category: SoundCategory;
  readonly volume: number;
  readonly radius: number;
  readonly loop: boolean;
};

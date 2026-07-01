import { assertEquals } from "@std/assert";
import { SplitMix32 } from "@/src/game/rng.ts";

Deno.test("SplitMix32 produces stable output for a seed", () => {
  const rng = new SplitMix32(0);

  assertEquals(rng.nextUint32(), 2_462_723_854);
  assertEquals(rng.nextUint32(), 1_020_716_019);
  assertEquals(rng.nextUint32(), 454_327_756);
});

Deno.test("SplitMix32 can resume from saved state", () => {
  const first = new SplitMix32(123_456_789);
  first.nextUint32();

  const resumed = new SplitMix32(first.getState());

  assertEquals(resumed.nextUint32(), first.nextUint32());
});

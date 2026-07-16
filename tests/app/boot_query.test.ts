import { bootQueryFromSearch } from "@/src/app/boot_query.ts";
import { assertEquals } from "@std/assert";

Deno.test("boot query normalizes valid seeds to uint32 and rejects unsafe values", () => {
  assertEquals(bootQueryFromSearch("?seed=-1").seed, 0xffff_ffff);
  assertEquals(bootQueryFromSearch("?seed=4294967297").seed, 1);
  assertEquals(bootQueryFromSearch("?seed=9007199254740992").seed, 42);
  assertEquals(bootQueryFromSearch("?seed=not-a-number").seed, 42);
});

import { World } from "@phughesmcr/miski";
import { ALL_COMPONENTS } from "@/src/ecs/components.ts";

const WORLD_CAPACITY = 1000;

export async function createWorld(): Promise<World> {
  const world = new World({
    capacity: WORLD_CAPACITY,
    components: ALL_COMPONENTS,
  });
  await world.init();
  return world;
}

import { ENTITY_SCHEMA } from "@/src/game/content/map_entities.ts";
import { z } from "zod";

const NON_NEGATIVE_INTEGER_SCHEMA = z.number().int().nonnegative();

const MAP_CONTENT_SCHEMA = z.object({
  name: z.string().min(1),
  tiles: z.array(z.array(NON_NEGATIVE_INTEGER_SCHEMA).nonempty()).nonempty(),
  entities: z.array(ENTITY_SCHEMA),
}).strict();

const CAMPAIGN_CONTENT_SCHEMA = z.object({
  startMapName: z.string().min(1),
  maps: z.array(MAP_CONTENT_SCHEMA).nonempty(),
}).strict()
  .refine((data) => data.maps.some((map) => map.name === data.startMapName), {
    message: "startMapName must match a map name",
    path: ["startMapName"],
  })
  .refine((data) => new Set(data.maps.map((map) => map.name)).size === data.maps.length, {
    message: "map names must be unique",
    path: ["maps"],
  });

export type MapContent = z.infer<typeof MAP_CONTENT_SCHEMA>;
export type CampaignContent = z.infer<typeof CAMPAIGN_CONTENT_SCHEMA>;

export function parseCampaignContent(data: unknown): CampaignContent {
  const parsed = CAMPAIGN_CONTENT_SCHEMA.safeParse(data);
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid campaign content:\n${formatZodError(parsed.error)}`);
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("\n");
}

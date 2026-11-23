import {
  type infer as Infer,
  int,
  maximum,
  minimum,
  strictObject,
} from "zod/mini";
import wire from "../generated/agent-cost.json" with { type: "json" };

type Fields = Record<keyof typeof wire.properties, ReturnType<typeof int>>;

export const agentCostSchema = strictObject(
  Object.fromEntries(
    Object.entries(wire.properties).map(([field, shape]) => [
      field,
      int().check(minimum(shape.minimum), maximum(shape.maximum)),
    ]),
  ) as Fields,
);
export type AgentCost = Infer<typeof agentCostSchema>;

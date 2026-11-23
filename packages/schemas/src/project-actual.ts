import { array, type infer as Infer, nullable, strictObject } from "zod/mini";
import { currencySchema } from "./plan";
import { nonnegativeInteger } from "./primitives";

export const projectBudgetSchema = strictObject({
  amountMicros: nonnegativeInteger,
  currency: currencySchema,
});

export const projectActualSchema = strictObject({
  budget: nullable(projectBudgetSchema),
  byCurrency: array(
    strictObject({
      currency: currencySchema,
      agentMicros: nonnegativeInteger,
      timeMicros: nonnegativeInteger,
      totalMicros: nonnegativeInteger,
    }),
  ),
  unratedMinutes: nonnegativeInteger,
});

export type ProjectBudget = Infer<typeof projectBudgetSchema>;

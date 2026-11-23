import { int, nullable, strictObject } from "zod/mini";
import { currencySchema } from "./plan";
import { nonnegativeInteger } from "./primitives";

export const projectMarginSchema = strictObject({
  currency: nullable(currencySchema),
  paidMicros: nonnegativeInteger,
  actualMicros: nonnegativeInteger,
  marginMicros: int(),
});

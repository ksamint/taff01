import {
  array,
  type infer as Infer,
  int,
  iso,
  maximum,
  minimum,
  refine,
  strictObject,
  string,
} from "zod/mini";
import { currencySchema } from "./plan";
import { idSchema, nonnegativeInteger, timeZone } from "./primitives";

const civilDay = iso.date().check(refine((day) => !day.startsWith("0000-")));
const timeEntryFields = {
  minutes: int().check(minimum(1), maximum(1440)),
  day: civilDay,
  note: string().check(
    refine(
      (value) => !value.includes("\0") && Array.from(value).length <= 2000,
    ),
  ),
};

export const timeEntrySchema = strictObject({
  id: idSchema,
  workspaceId: idSchema,
  taskId: idSchema,
  personId: idSchema,
  ...timeEntryFields,
  createdAt: iso.datetime(),
});
export const timeEntriesListSchema = strictObject({
  timeZone: string().check(refine(timeZone)),
  today: civilDay,
  entries: array(timeEntrySchema),
});
export const timeEntryInputSchema = strictObject({
  taskId: idSchema,
  ...timeEntryFields,
});
export const timeEntryEditSchema = strictObject(timeEntryFields);
export const memberRateSchema = strictObject({
  workspaceId: idSchema,
  personId: idSchema,
  rateMicrosPerHour: nonnegativeInteger,
  currency: currencySchema,
  validFrom: civilDay,
});
export const memberRateListSchema = array(memberRateSchema);

export type TimeEntry = Infer<typeof timeEntrySchema>;
export type MemberRate = Infer<typeof memberRateSchema>;

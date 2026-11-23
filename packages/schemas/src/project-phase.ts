import {
  array,
  type infer as Infer,
  int,
  minimum,
  refine,
  strictObject,
  string,
} from "zod/mini";
import { civilDateSchema } from "./plan";
import { idSchema } from "./primitives";

const fields = {
  name: string().check(
    refine((value) => {
      const length = Array.from(value.trim()).length;
      return !value.includes("\0") && length >= 1 && length <= 120;
    }),
  ),
  start: civilDateSchema,
  end: civilDateSchema,
};
const orderedSpan = refine<{ start: string; end: string }>(
  (value) => value.start <= value.end,
);

export const projectPhaseSchema = strictObject({
  id: idSchema,
  workspaceId: idSchema,
  projectId: idSchema,
  position: int().check(minimum(0)),
  ...fields,
}).check(orderedSpan);
export const projectPhaseListSchema = array(projectPhaseSchema);
export const projectPhaseInputSchema = strictObject({
  projectId: idSchema,
  ...fields,
}).check(orderedSpan);
export const projectPhaseEditSchema = strictObject(fields).check(orderedSpan);
export type ProjectPhase = Infer<typeof projectPhaseSchema>;

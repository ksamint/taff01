import { writeFileSync } from "node:fs";
import { restJsonSchema } from "./rest-contracts";

writeFileSync(
  new URL("../../../packages/schemas/generated/rest.json", import.meta.url),
  `${JSON.stringify(restJsonSchema(), null, 2)}\n`,
);

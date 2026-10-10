import {
  array,
  type infer as Infer,
  maxLength,
  minLength,
  refine,
  strictObject,
  string,
  trim,
} from "zod/mini";
import { mainlandPhoneSchema, usernameSchema } from "./base";
/** Trusted runtime administration only; no HTTP or MCP adapter exposes this. */
export const administrationProvisionSchema = strictObject({
  workspaceNames: array(
    string().check(trim(), minLength(1), maxLength(100)),
  ).check(
    minLength(1),
    maxLength(20),
    refine((names) => new Set(names).size === names.length),
  ),
  systemAdminPhones: array(mainlandPhoneSchema).check(
    minLength(1),
    maxLength(10),
    refine((phones) => new Set(phones).size === phones.length),
  ),
  orgAdmin: strictObject({
    username: usernameSchema,
    password: string().check(minLength(6), maxLength(128)),
    workspaceName: string().check(trim(), minLength(1), maxLength(100)),
  }),
}).check(
  refine((input) =>
    input.workspaceNames.includes(input.orgAdmin.workspaceName),
  ),
);
export type AdministrationProvision = Infer<
  typeof administrationProvisionSchema
>;

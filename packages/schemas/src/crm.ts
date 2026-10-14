// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales.
import {
  array,
  boolean,
  email,
  type infer as Infer,
  iso,
  literal,
  maxLength,
  nullable,
  number,
  object,
  optional,
  refine,
  strictObject,
  string,
  trim,
  union,
  enum as zodEnum,
} from "zod/mini";
import { boundedText, idSchema, versionSchema } from "./primitives";

/** Where a contact can hold a role. */
export const contactScopeSchema = zodEnum(["company", "project", "task"]);
export const contactRoleSchema = zodEnum([
  "decider",
  "chair",
  "ops",
  "broker",
  "tech",
  "finance",
  "signoff",
]);
export type ContactScope = Infer<typeof contactScopeSchema>;
export type ContactRole = Infer<typeof contactRoleSchema>;
/**
 * The one table of allowed roles. Zod, core, the UI and the database CHECK
 * `contact_roles_scope_role` all follow it (a test keeps the SQL equal).
 * Labels live in i18next (`crm.role.<role>`), never in the database.
 */
export const CONTACT_ROLE_RULES: readonly {
  role: ContactRole;
  scopes: readonly ContactScope[];
  exclusive: boolean;
}[] = [
  { role: "decider", scopes: ["company", "project", "task"], exclusive: false },
  { role: "chair", scopes: ["company"], exclusive: true },
  { role: "ops", scopes: ["company", "project", "task"], exclusive: false },
  { role: "broker", scopes: ["project"], exclusive: false },
  { role: "tech", scopes: ["project", "task"], exclusive: false },
  { role: "finance", scopes: ["company", "project"], exclusive: false },
  { role: "signoff", scopes: ["project", "task"], exclusive: true },
];
export function roleAllowed(role: ContactRole, scope: ContactScope): boolean {
  return !!CONTACT_ROLE_RULES.find(
    (rule) => rule.role === role,
  )?.scopes.includes(scope);
}
export function roleExclusive(role: ContactRole): boolean {
  return !!CONTACT_ROLE_RULES.find((rule) => rule.role === role)?.exclusive;
}
export function rolesForScope(scope: ContactScope): ContactRole[] {
  return CONTACT_ROLE_RULES.filter((rule) => rule.scopes.includes(scope)).map(
    (rule) => rule.role,
  );
}

const optionalText = (max: number) =>
  optional(string().check(trim(), maxLength(max)));
const emailOrEmpty = string().check(
  trim(),
  maxLength(320),
  refine((value) => value === "" || email().safeParse(value).success),
);

export const companySchema = object({
  id: idSchema,
  workspaceId: idSchema,
  name: string(),
  industry: string(),
  archivedAt: nullable(iso.datetime()),
  version: versionSchema,
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const companyListSchema = array(companySchema);
export const companyInputSchema = strictObject({
  name: boundedText(200),
  industry: optionalText(100),
});
export const companyUpdateSchema = strictObject({
  version: versionSchema,
  name: optional(boundedText(200)),
  industry: optionalText(100),
  /** The UI's 刪除 archives (D4); false restores. */
  archived: optional(boolean()),
}).check(
  refine(
    (v) =>
      v.name !== undefined ||
      v.industry !== undefined ||
      v.archived !== undefined,
  ),
);
/** Phone and email are null when an agent lacks `crm.contact_details`. */
export const contactSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  companyId: nullable(idSchema),
  name: string(),
  title: string(),
  phone: nullable(string()),
  email: nullable(string()),
  archivedAt: nullable(iso.datetime()),
  version: versionSchema,
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const contactListSchema = array(contactSchema);
export const contactInputSchema = strictObject({
  name: boundedText(200),
  title: optionalText(200),
  companyId: optional(nullable(idSchema)),
  phone: optionalText(50),
  email: optional(emailOrEmpty),
});
export const contactUpdateSchema = strictObject({
  version: versionSchema,
  name: optional(boundedText(200)),
  title: optionalText(200),
  phone: optionalText(50),
  email: optional(emailOrEmpty),
  archived: optional(boolean()),
}).check(
  refine((v) =>
    [v.name, v.title, v.phone, v.email, v.archived].some(
      (field) => field !== undefined,
    ),
  ),
);
export const contactCompanyInputSchema = strictObject({
  version: versionSchema,
  companyId: nullable(idSchema),
});
export const contactFilterSchema = strictObject({
  companyId: optional(idSchema),
  query: optional(string().check(trim(), maxLength(200))),
  includeArchived: optional(boolean()),
});
/** PUT …/contacts/:contactId body: the complete role set on that link. */
export const contactLinkInputSchema = strictObject({
  roles: array(contactRoleSchema).check(
    maxLength(7),
    refine((v) => new Set(v).size === v.length),
  ),
});
export const contactLinkSchema = object({
  scope: contactScopeSchema,
  entityId: idSchema,
  contactId: idSchema,
  roles: array(contactRoleSchema),
  contact: contactSchema,
});
export const contactLinkListSchema = array(contactLinkSchema);
export const setContactRolesResultSchema = object({
  link: contactLinkSchema,
  /** Exclusive roles moved away from their previous holders. */
  replaced: array(object({ role: contactRoleSchema, contactId: idSchema })),
  /** A task link added the contact as a stakeholder of the task's project. */
  addedProjectStakeholder: boolean(),
  /** The previous role set, so the client can undo with another PUT. */
  previousRoles: nullable(array(contactRoleSchema)),
});
export const unlinkContactResultSchema = object({
  cascadedTaskLinks: number(),
});
export const setContactCompanyResultSchema = object({
  contact: contactSchema,
  /** Company links (and their roles) dropped at the previous employer. */
  dropped: number(),
  previousCompanyId: nullable(idSchema),
});
/** Every link of one contact, for the contact page. */
export const contactDetailSchema = object({
  contact: contactSchema,
  company: nullable(companySchema),
  links: array(
    object({
      scope: contactScopeSchema,
      entityId: idSchema,
      title: string(),
      projectId: nullable(idSchema),
      roles: array(contactRoleSchema),
    }),
  ),
});
export const crmAuditIssueSchema = object({
  code: zodEnum([
    "foreign_company_link",
    "task_contact_not_stakeholder",
    "role_out_of_scope",
    "exclusive_role_conflict",
    "cross_workspace_link",
  ]),
  id: idSchema,
});
export const crmAuditSchema = array(crmAuditIssueSchema);
const entityRef = union([
  strictObject({ kind: literal("company"), id: idSchema }),
  strictObject({ kind: literal("project"), id: idSchema }),
  strictObject({ kind: literal("task"), id: idSchema }),
]);
export const contactEntityRefSchema = entityRef;

export const mcpCompaniesListArgs = strictObject({
  includeArchived: optional(boolean()),
});
export const mcpContactsListArgs = contactFilterSchema;
export const mcpContactsGetArgs = strictObject({ contactId: idSchema });

export type Company = Infer<typeof companySchema>;
export type CompanyInput = Infer<typeof companyInputSchema>;
export type CompanyUpdate = Infer<typeof companyUpdateSchema>;
export type Contact = Infer<typeof contactSchema>;
export type ContactInput = Infer<typeof contactInputSchema>;
export type ContactUpdate = Infer<typeof contactUpdateSchema>;
export type ContactCompanyInput = Infer<typeof contactCompanyInputSchema>;
export type ContactFilter = Infer<typeof contactFilterSchema>;
export type ContactLinkInput = Infer<typeof contactLinkInputSchema>;
export type ContactLink = Infer<typeof contactLinkSchema>;
export type SetContactRolesResult = Infer<typeof setContactRolesResultSchema>;
export type UnlinkContactResult = Infer<typeof unlinkContactResultSchema>;
export type SetContactCompanyResult = Infer<
  typeof setContactCompanyResultSchema
>;
export type ContactDetail = Infer<typeof contactDetailSchema>;
export type CrmAuditIssue = Infer<typeof crmAuditIssueSchema>;
export type ContactEntityRef = Infer<typeof contactEntityRefSchema>;

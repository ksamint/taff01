// Pure helpers for the CRM screens (M15): search, grouping and validation.
import {
  type Company,
  type Contact,
  type ContactDetail,
  type ContactScope,
  contactInputSchema,
} from "@taff/schemas/crm";

const fold = (text: string) => text.trim().toLocaleLowerCase();

/** A contact matches its name, title, company name, phone or email. */
export function contactMatches(
  contact: Contact,
  query: string,
  companyName = "",
): boolean {
  const text = fold(query);
  if (!text) return true;
  return [
    contact.name,
    contact.title,
    companyName,
    contact.phone ?? "",
    contact.email ?? "",
  ].some((field) => fold(field).includes(text));
}

/** A company matches its name or industry. */
export function companyMatches(company: Company, query: string): boolean {
  const text = fold(query);
  return (
    !text ||
    fold(company.name).includes(text) ||
    fold(company.industry).includes(text)
  );
}

export type ContactFields = {
  name: string;
  title: string;
  phone: string;
  email: string;
};
export type ContactFieldErrors = Partial<
  Record<keyof ContactFields, "required" | "phone" | "email" | "tooLong">
>;

/** Digits with optional +, spaces, dots, dashes and brackets; 3–50 long. */
const PHONE = /^\+?[\d\s().-]{3,50}$/;

/**
 * Field errors for the contact form, with the same limits as the API
 * (`contactInputSchema`) plus a phone shape check.
 */
export function validateContactFields(
  fields: ContactFields,
): ContactFieldErrors {
  const errors: ContactFieldErrors = {};
  const name = fields.name.trim();
  if (!name) errors.name = "required";
  else if (name.length > 200) errors.name = "tooLong";
  if (fields.title.trim().length > 200) errors.title = "tooLong";
  const phone = fields.phone.trim();
  if (phone && (!PHONE.test(phone) || !/\d/.test(phone)))
    errors.phone = "phone";
  const email = fields.email.trim();
  if (email && !contactInputSchema.safeParse({ name: "x", email }).success)
    errors.email = "email";
  return errors;
}

/** A contact page's links grouped by scope, in company, project, task order. */
export function groupContactLinks(links: ContactDetail["links"]) {
  const scopes: ContactScope[] = ["company", "project", "task"];
  return scopes
    .map((scope) => ({
      scope,
      links: links.filter((link) => link.scope === scope),
    }))
    .filter((group) => group.links.length > 0);
}

/** A stakeholder from outside the project's client company. */
export function isExternal(
  contact: Pick<Contact, "companyId">,
  clientCompanyId: string | null | undefined,
): boolean {
  return !!clientCompanyId && contact.companyId !== clientCompanyId;
}

/** The phone/desktop route of a link's entity. */
export function linkHref(link: {
  scope: ContactScope;
  entityId: string;
}): string {
  return link.scope === "company"
    ? `/companies/${link.entityId}`
    : link.scope === "project"
      ? `/projects/${link.entityId}?view=stakeholders`
      : `/tasks/${link.entityId}`;
}

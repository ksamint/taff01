"use client";
// 項目 · 公司 · 聯繫人, the phone switch above Projects, Companies and
// Contacts (prototype v2 phone 260–275). The desktop sidebar lists them.
import "../../styles/crm.css";
import Link from "next/link";
import { useTranslation } from "react-i18next";

const SECTIONS = [
  { key: "projects", href: "/projects", label: "projects.title" },
  { key: "companies", href: "/companies", label: "crm.companies.title" },
  { key: "contacts", href: "/contacts", label: "crm.contacts.title" },
] as const;

export function CrmSections({
  active,
}: {
  active: "projects" | "companies" | "contacts";
}) {
  const { t } = useTranslation();
  return (
    <nav className="crm-sections" aria-label={t("projects.sections")}>
      {SECTIONS.map((section) => (
        <Link
          key={section.key}
          className="crm-section-link"
          href={section.href}
          prefetch={false}
          data-testid={`crm-section-${section.key}`}
          aria-current={active === section.key ? "page" : undefined}
        >
          {t(section.label)}
        </Link>
      ))}
    </nav>
  );
}

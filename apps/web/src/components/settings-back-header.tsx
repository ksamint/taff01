import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function SettingsBackHeader({
  href,
  label,
  ...linkProps
}: {
  href: string;
  label: string;
  "data-testid"?: string;
}) {
  return (
    <header className="settings-back-header">
      <Link className="back-link" href={href} {...linkProps}>
        <ArrowLeft size={16} aria-hidden="true" />
        {label}
      </Link>
    </header>
  );
}

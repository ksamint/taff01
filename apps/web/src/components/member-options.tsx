import type { Locale, Member } from "@taff/schemas";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "./app-shell";

export function MemberOptions({ members }: { members: Member[] }) {
  const { t, i18n } = useTranslation();
  const { me } = useWorkspace();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  return memberOptions(members, t, locale);
}

export function memberOptions(members: Member[], t: TFunction, locale: Locale) {
  return (
    <>
      <option value="">{t("unassigned")}</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name} · {t(member.kind)}
        </option>
      ))}
    </>
  );
}

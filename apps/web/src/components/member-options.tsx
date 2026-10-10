import type { Member } from "@taff/schemas";
import {
  type PrototypeLocale,
  presentPrototypeField,
} from "@taff/schemas/prototype-data";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "./app-shell";

export function MemberOptions({ members }: { members: Member[] }) {
  const { t, i18n } = useTranslation();
  const { me } = useWorkspace();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as PrototypeLocale;
  return memberOptions(members, t, locale);
}

export function memberOptions(
  members: Member[],
  t: TFunction,
  locale: PrototypeLocale,
) {
  return (
    <>
      <option value="">{t("unassigned")}</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {presentPrototypeField(member.id, "name", member.name, locale)} ·{" "}
          {t(member.kind)}
        </option>
      ))}
    </>
  );
}

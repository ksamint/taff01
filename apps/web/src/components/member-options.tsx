import type { Member } from "@taff/schemas";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

export function MemberOptions({ members }: { members: Member[] }) {
  const { t } = useTranslation();
  return memberOptions(members, t);
}

export function memberOptions(members: Member[], t: TFunction) {
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

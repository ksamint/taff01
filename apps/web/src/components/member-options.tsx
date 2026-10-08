import type { Member } from "@taff/schemas";
import { useTranslation } from "react-i18next";

export function MemberOptions({ members }: { members: Member[] }) {
  const { t } = useTranslation();
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

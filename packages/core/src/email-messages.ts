import type { Locale } from "@taff/schemas";
import { createInstance } from "i18next";

/** Server-only resources use the same email keys as the three UI common locales. */
export const emailResources = {
  en: {
    emailInvitationSubject: "You have been invited to a Taff workspace",
    emailInvitationBody:
      "You have been invited to join a Taff workspace. Sign in with this email address, verify its ownership, and accept the invitation within seven days:\n{{link}}",
    emailVerificationSubject: "Verify your Taff email address",
    emailVerificationBody:
      "Confirm ownership of your Taff email address using this link within one hour:\n{{link}}\nIf you did not request this, ignore this message.",
  },
  "zh-CN": {
    emailInvitationSubject: "你受邀加入 Taff 工作空间",
    emailInvitationBody:
      "你受邀加入 Taff 工作空间。请使用此邮箱地址登录、验证地址所有权，并在七天内接受邀请：\n{{link}}",
    emailVerificationSubject: "验证你的 Taff 邮箱地址",
    emailVerificationBody:
      "请在一小时内通过此链接确认你拥有这个 Taff 邮箱地址：\n{{link}}\n如果不是你提出的请求，请忽略此消息。",
  },
  "zh-HK": {
    emailInvitationSubject: "你獲邀加入 Taff 工作空間",
    emailInvitationBody:
      "你獲邀加入 Taff 工作空間。請以此電郵地址登入、驗證地址擁有權，並在七天內接受邀請：\n{{link}}",
    emailVerificationSubject: "驗證你的 Taff 電郵地址",
    emailVerificationBody:
      "請在一小時內透過此連結確認你擁有這個 Taff 電郵地址：\n{{link}}\n如非你提出的要求，請忽略此訊息。",
  },
} satisfies Record<Locale, Record<string, string>>;
// Embedded resources initialize synchronously; a private instance never races the
// application's current language or another recipient's message.
const mailI18n = createInstance();
void mailI18n.init({
  initAsync: false,
  lng: "en",
  fallbackLng: "en",
  defaultNS: "email",
  resources: {
    en: { email: emailResources.en },
    "zh-CN": { email: emailResources["zh-CN"] },
    "zh-HK": { email: emailResources["zh-HK"] },
  },
  interpolation: { escapeValue: false }, // Plain text; links are not HTML.
});
export function emailMessage(
  kind: "invitation" | "verification",
  locale: string,
  link: string,
) {
  const t = mailI18n.getFixedT(
    locale === "zh-CN" || locale === "zh-HK" ? locale : "en",
    "email",
  );
  return kind === "invitation"
    ? {
        subject: t("emailInvitationSubject"),
        text: t("emailInvitationBody", { link }),
      }
    : {
        subject: t("emailVerificationSubject"),
        text: t("emailVerificationBody", { link }),
      };
}

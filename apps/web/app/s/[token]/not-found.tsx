import { headers } from "next/headers";
import "../../../src/styles/summaries.css";
import {
  acceptedLanguages,
  detectLocale,
  htmlLang,
} from "../../../src/lib/i18n";
import { serverTranslator } from "../../../src/lib/server-translate";

/** Unknown, expired and revoked links all look the same (ADR 0027). */
export default async function NotFound() {
  const locale = detectLocale(
    acceptedLanguages((await headers()).get("accept-language")),
  );
  const t = serverTranslator(locale);
  return (
    <main
      className="shared-summary-page shared-summary-unavailable"
      lang={htmlLang(locale)}
      data-testid="share-unavailable"
    >
      <h1>{t("summary.unavailableTitle")}</h1>
      <p>{t("summary.unavailableHint")}</p>
    </main>
  );
}

import type { Locale } from "@taff/schemas/base";
import type { i18n } from "i18next";
import { isLocale } from "./i18n";
export function installLocaleLoader(
  instance: i18n,
  load: (language: Locale) => Promise<object>,
) {
  const original = instance.changeLanguage.bind(instance);
  let generation = 0;
  instance.changeLanguage = async (language, callback) => {
    const request = ++generation;
    if (
      isLocale(language) &&
      !instance.hasResourceBundle(language, "translation")
    ) {
      const bundle = await load(language);
      if (request !== generation) return instance.t;
      instance.addResourceBundle(language, "translation", bundle);
    }
    if (request !== generation) return instance.t;
    return original(language, callback);
  };
  return () => {
    generation++;
    // Keep copied React methods stable across effect cleanup and remount.
  };
}

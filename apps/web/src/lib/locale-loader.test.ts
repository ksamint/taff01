import { createInstance } from "i18next";
import { expect, it } from "vitest";
import { installLocaleLoader } from "./locale-loader";

it("loads English on demand from a server-supplied Chinese locale", async () => {
  const instance = createInstance();
  await instance.init({
    lng: "zh-HK",
    resources: { "zh-HK": { translation: { app: "任務" } } },
  });
  const loaded: string[] = [];
  const cleanup = installLocaleLoader(instance, async (language) => {
    loaded.push(language);
    return { app: "Taff" };
  });
  await instance.changeLanguage("zh-HK");
  expect(loaded).toEqual([]);
  expect(instance.t("app")).toBe("任務");
  await instance.changeLanguage("en");
  expect(loaded).toEqual(["en"]);
  expect(instance.language).toBe("en");
  expect(instance.t("app")).toBe("Taff");
  cleanup();
});

it("ignores an older Chinese resource request after a newer saved English choice", async () => {
  const instance = createInstance();
  await instance.init({
    lng: "en",
    resources: { en: { translation: { app: "Taff" } } },
  });
  let resolve!: (bundle: object) => void;
  const cleanup = installLocaleLoader(
    instance,
    () =>
      new Promise((value) => {
        resolve = value;
      }),
  );
  const old = instance.changeLanguage("zh-CN");
  await instance.changeLanguage("en");
  resolve({ app: "任务" });
  await old;
  expect(instance.language).toBe("en");
  expect(instance.t("app")).toBe("Taff");
  cleanup();
});
it("keeps the latest Chinese choice and ignores resources completing after cleanup", async () => {
  const instance = createInstance();
  await instance.init({
    lng: "en",
    resources: { en: { translation: { app: "Taff" } } },
  });
  const pending = new Map<string, (bundle: object) => void>();
  const cleanup = installLocaleLoader(
    instance,
    (language) =>
      new Promise((resolve) => {
        pending.set(language, resolve);
      }),
  );
  const old = instance.changeLanguage("zh-CN");
  const latest = instance.changeLanguage("zh-HK");
  pending.get("zh-HK")?.({ app: "任務" });
  await latest;
  pending.get("zh-CN")?.({ app: "任务" });
  await old;
  expect(instance.language).toBe("zh-HK");
  const next = instance.changeLanguage("zh-CN");
  cleanup();
  pending.get("zh-CN")?.({ app: "任务" });
  await next;
  expect(instance.language).toBe("zh-HK");
  const snapshot = Object.create(
    instance,
    Object.getOwnPropertyDescriptors(instance),
  );
  const remounted = snapshot.changeLanguage("zh-CN");
  pending.get("zh-CN")?.({ app: "任务" });
  await remounted;
  expect(instance.language).toBe("zh-CN");
  expect(instance.t("app")).toBe("任务");
});

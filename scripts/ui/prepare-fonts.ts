// Capture the installed faces deterministically; cold product renders keep optional display.
export async function prepareFonts() {
  const rules = [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter(
      (rule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE,
    )
    .filter((rule) => /Manrope|Noto Sans TC/.test(rule.style.fontFamily));
  if (rules.length !== 16)
    throw new Error("Expected the 16 installed UI font faces");
  // A previously resolved ready promise does not cover newly inserted text.
  // Load this text's computed font stack before selecting capture faces; loading
  // every rule instead would fetch unrelated CJK subsets on English screens.
  document.body.getBoundingClientRect();
  const text = document.body.innerText;
  if (text)
    await document.fonts.load(getComputedStyle(document.body).font, text);
  await document.fonts.ready;
  const active = [...document.fonts].filter((face) => face.status === "loaded");
  const state = window as typeof window & {
    __taffCaptureFaces?: Map<string, FontFace>;
    __taffActiveCaptureFaces?: FontFace[];
  };
  const cache = (state.__taffCaptureFaces ??= new Map());
  const faces = rules
    .filter(({ style }) =>
      active.some(
        (face) =>
          face.family.replace(/["']/g, "") ===
            style.fontFamily.replace(/["']/g, "") &&
          face.unicodeRange === style.getPropertyValue("unicode-range"),
      ),
    )
    .map(({ style }) => {
      const key = style.cssText;
      if (!cache.has(key))
        cache.set(
          key,
          new FontFace(
            style.fontFamily.replace(/^(["'])(.*)\1$/, "$2"),
            style.getPropertyValue("src"),
            {
              weight: style.fontWeight,
              style: style.fontStyle,
              unicodeRange: style.getPropertyValue("unicode-range"),
              display: "block",
            },
          ),
        );
      return cache.get(key)!;
    });
  await Promise.all(faces.map((face) => face.load()));
  if (faces.some((face) => face.status !== "loaded"))
    throw new Error("UI font did not load");
  // Keep already-installed faces alive. Removing and immediately re-adding a
  // face used by a native control needlessly invalidates its cached text font.
  // New late-text faces still enter in CSS order after all downloads finish.
  const installed = new Set(state.__taffActiveCaptureFaces ?? []);
  const wanted = new Set(faces);
  for (const face of installed)
    if (!wanted.has(face)) document.fonts.delete(face);
  for (const face of faces) if (!installed.has(face)) document.fonts.add(face);
  state.__taffActiveCaptureFaces = faces;
  document.body.getBoundingClientRect();
  await document.fonts.ready;
  // Chromium's native select inner line-height can retain fallback metrics
  // after its glyphs switch to the loaded web font. Recalculate its font style
  // without detaching controls, changing inline attributes or dispatching events.
  if (document.querySelector("select")) {
    const refresh = document.createElement("style");
    refresh.textContent = "select { font-size: 0 !important; }";
    try {
      document.head.append(refresh);
      document.body.getBoundingClientRect();
    } finally {
      refresh.remove();
      document.body.getBoundingClientRect();
    }
  }
}

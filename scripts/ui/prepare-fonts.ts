// Capture the installed faces deterministically; cold product renders keep optional display.
export async function prepareFonts() {
  const rules = [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter(
      (rule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE,
    )
    .filter((rule) => /Manrope|Noto Sans TC/.test(rule.style.fontFamily));
  if (rules.length !== 7)
    throw new Error("Expected the seven installed UI font faces");
  // Let the browser select the applicable Unicode faces first. Eagerly loading
  // every rule made an English screen fetch all CJK subsets during capture.
  await document.fonts.ready;
  const active = [...document.fonts].filter((face) => face.status === "loaded");
  await Promise.all(
    rules
      .filter(({ style }) =>
        active.some(
          (face) =>
            face.family.replace(/["']/g, "") ===
              style.fontFamily.replace(/["']/g, "") &&
            face.unicodeRange === style.getPropertyValue("unicode-range"),
        ),
      )
      .map(async ({ style }) => {
        const face = new FontFace(
          style.fontFamily.replace(/^(["'])(.*)\1$/, "$2"),
          style.getPropertyValue("src"),
          {
            weight: style.fontWeight,
            style: style.fontStyle,
            unicodeRange: style.getPropertyValue("unicode-range"),
            display: "block",
          },
        );
        await face.load();
        if (face.status !== "loaded") throw new Error("UI font did not load");
        document.fonts.add(face);
      }),
  );
  await document.fonts.ready;
}

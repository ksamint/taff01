// Capture the installed faces deterministically; cold product renders keep optional display.
export async function prepareFonts() {
  const rules = [...document.styleSheets]
    .flatMap((sheet) => [...sheet.cssRules])
    .filter(
      (rule): rule is CSSFontFaceRule => rule.type === CSSRule.FONT_FACE_RULE,
    )
    .filter((rule) => /Manrope|Noto Sans TC/.test(rule.style.fontFamily));
  if (rules.length !== 4)
    throw new Error("Expected the four installed UI font faces");
  await Promise.all(
    rules.map(async ({ style }) => {
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

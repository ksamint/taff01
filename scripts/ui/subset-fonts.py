"""Rebuild v0.2.1 supplements with fontTools 4.66.1 + Brotli 1.2.0 (MIT).

Run from the repo root: python scripts/ui/subset-fonts.py /path/to/NotoSansSC.ttf /path/to/NotoSansMath.ttf
The SC source is official Google Fonts, pinned and checked below. Existing TC
assets are preserved except for moving identical symbol glyphs to a tiny face.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

FONTS = Path("apps/web/public/fonts")
SC_SHA = "a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da"
SC_URL = "https://raw.githubusercontent.com/google/fonts/2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
sc_source = Path(sys.argv[1])
assert hashlib.sha256(sc_source.read_bytes()).hexdigest() == SC_SHA
symbol_source = Path(sys.argv[2])
SYMBOL_SHA = "3f495fe933c06786e4d5f6d86b8ee70b6753a68ee3b9d87528726de0f6e2c47d"
SYMBOL_URL = "https://raw.githubusercontent.com/google/fonts/dbd1ab6e65dc59bcda3ca8de9fd372f58f98e0af/ofl/notosansmath/NotoSansMath-Regular.ttf"
assert hashlib.sha256(symbol_source.read_bytes()).hexdigest() == SYMBOL_SHA
source = Path("docs/ui/prototype/vendor/NotoSansTC.ttf")
tc_cmap = set(TTFont(source).getBestCmap())
manrope = set(TTFont(FONTS / "Manrope-latin.woff2").getBestCmap())


def values(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from values(child)


texts = []
for locale in ("en", "zh-CN", "zh-HK"):
    texts.extend(values(json.loads((Path("apps/web/locales") / locale / "common.json").read_text())))
for path in [
    *(p for folder in ("apps/web/src", "apps/web/app") for p in Path(folder).rglob("*")
      if p.suffix in (".ts", ".tsx") and ".test." not in p.name),
    Path("packages/schemas/src/prototype-data.ts"),
    Path("packages/core/src/prototype-mind.ts"),
    Path("packages/core/src/prototype-seed.ts"),
    Path("packages/core/src/seed.ts"),
]:
    texts.append(path.read_text())
wanted = {ord(c) for text in texts for c in text if ord(c) > 0xFF} - {0x3400, 0x9FFF}
missing = {point for point in wanted - tc_cmap - manrope if 0x3400 <= point <= 0x9FFF}
assert missing <= set(TTFont(sc_source).getBestCmap()), "SC source lacks required UI glyphs"
symbols = {0x2191, 0x2192, 0x2193, 0x2194, 0x2318}
remaining = set(TTFont(FONTS / "NotoSansTC-ui-remaining.woff2").getBestCmap()) - symbols


def ranges(points):
    out = []
    for point in sorted(points):
        if out and point == out[-1][-1] + 1:
            out[-1].append(point)
        else:
            out.append([point])
    return ", ".join(f"U+{row[0]:04X}" + (f"-{row[-1]:04X}" if len(row) > 1 else "") for row in out)


records = []
css = Path("apps/web/src/styles/tokens.css")
css_text = css.read_text()
for name, origin, points in (
    ("NotoSansTC-ui-remaining", source, remaining),
    ("NotoSansTC-ui-symbols", source, symbols),
    ("NotoSansSC-ui", sc_source, missing),
    ("NotoSansMath-ui", symbol_source, {0x21B3}),
):
    font = TTFont(origin, recalcTimestamp=False)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.glyph_names = True
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.recalc_timestamp = False
    worker = subset.Subsetter(options=options)
    worker.populate(unicodes=points)
    worker.subset(font)
    font.flavor = "woff2"
    target = FONTS / f"{name}.woff2"
    font.save(target)
    assert set(TTFont(target).getBestCmap()) == points
    rule = f'''@font-face {{
  font-family: "Noto Sans TC";
  src: url("/fonts/{name}.woff2") format("woff2");
  font-weight: 300 600;
  font-style: normal;
  font-display: optional;
  unicode-range: {ranges(points)};
}}'''
    pattern = r'@font-face \{[^}]*' + re.escape(f'/fonts/{name}.woff2') + r'[^}]*\}'
    if re.search(pattern, css_text):
        css_text = re.sub(pattern, lambda _: rule, css_text)
    else:
        css_text = css_text.replace(":root {", rule + "\n:root {", 1)
    records.append(dict(file=target.name, mappings=len(points), unicodeRange=ranges(points),
                        bytes=target.stat().st_size, sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
css.write_text(css_text)
manifest = dict(scSourceUrl=SC_URL, scSourceSha256=SC_SHA, symbolSourceUrl=SYMBOL_URL, symbolSourceSha256=SYMBOL_SHA, subsets=records)
(FONTS / "v021-subsets.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(json.dumps(manifest, indent=2))

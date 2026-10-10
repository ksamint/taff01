# Approved TABLE AI fonts

Manrope.ttf is the original variable Manrope asset from the approved TABLE AI
prototype. Manrope.woff2 is its lossless WOFF2 conversion using fontTools 4.66.1
and Brotli 1.2.0 (both MIT), installed only in a temporary conversion environment.
Glyph order, Unicode coverage and variable axes were verified unchanged. The
compressed asset is used at runtime; the original remains for provenance.
Manrope-latin.woff2 is a 27,732-byte subset of the same original for Latin-1,
punctuation, symbols and ligatures. CSS Unicode ranges load it for common UI
text and retain the complete Manrope.woff2 for extended Latin, Greek, Cyrillic
and the font's private-use glyphs. Together the ranges cover every original
Unicode mapping. Subset outlines and horizontal metrics match the original
at weights 200, 400, 600 and 800; the variable weight axis stays 200–800.

Regenerate with fontTools 4.66.1 and Brotli 1.2.0:

```sh
pyftsubset Manrope.ttf --output-file=Manrope-latin.woff2 --flavor=woff2 \
  --unicodes='U+0000-00FF,U+2000-2FFF,U+FB00-FB06' \
  --layout-features='*' --glyph-names
```

Subset SHA-256:
a3af87e87699db011014cee738bce19c161d6f72ac55d7457050824aaf7b673c

Manrope remains under the approved SIL Open Font License 1.1 in Manrope-OFL.txt;
no new code dependency is required.

NotoSansTC-ui.woff2 is the original variable UI subset of Noto Sans TC, downloaded
from the official Google Fonts CSS API on 2026-10-09. Its text set contains the
non-Latin characters in all three application locale dictionaries. The existing
system CJK fallbacks cover characters outside this subset in user content.

Noto Sans TC is an approved font asset from docs/ui/README.md, licensed under the
SIL Open Font License 1.1; the complete licence is NotoSansTC-OFL.txt. Source:
https://github.com/google/fonts/tree/main/ofl/notosanstc

Current subset SHA-256:
5f0b1aa25010879e43191024b18eebf6dc25acab3e49a09639d7fc07ab642d9f

Regenerate through https://fonts.googleapis.com/css2 with family
Noto Sans TC:wght@300..600, display=swap and text set to the unique sorted
non-Latin characters from locales/{en,zh-CN,zh-HK}/common.json. Use a modern
Chrome User-Agent for WOFF2, download the returned font URL, verify its wOF2
header and update this hash. Font requests at runtime stay on the same origin.

The M9 Unicode split keeps that original 169,180-byte subset for provenance.
The two runtime assets use the same Noto Sans TC family, CSS weight range
300–600 and `font-display: optional`. The source and both assets retain the
actual `fvar` weight axis of 100–900; CSS advertises the narrower range used
by the application.

| Asset | Unicode mappings | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| NotoSansTC-ui-common.woff2 | 171 | 47,620 | `0d3ebcb469892ff166152e19a79f2fe1e9d8baec72f33fc61f630f4754b99924` |
| NotoSansTC-ui-remaining.woff2 | 543 | 169,500 | `a381d949f3b7236b4c2536a654c1161173bb4c2e99856c99c09767c319c346fa` |

The common set contains supported characters from every top-level string,
navigation label, task status and run status in all three dictionaries.
This covers shared UI, loading and Today text without task-fixture-specific
characters. The remaining set is the exact complement in the original font.
Their disjoint CSS Unicode ranges cover all 540 original mappings; unsupported
user-content characters continue to use the existing system fallbacks.

The split was made locally with fontTools 4.66.1 and Brotli 1.2.0 (MIT), without
another font download or production dependency. Outlines, horizontal and
vertical metrics match the original at weights 100, 300, 400, 500, 600 and 900;
units per em, line metrics and variable axes also match. There are no nonzero
default kerning pairs across the split. The source's locale and vertical
substitutions operate on single glyphs, so no substitution spans the two faces.
Optional display controls swapping; matching fonts still consume bandwidth.

Regenerate from the repository root with Python that has those tool versions.
This also prints the exact CSS ranges, which must be updated together with the
assets when dictionary text changes:

```sh
python - <<'PY'
from pathlib import Path
import hashlib
import json
from fontTools import subset
from fontTools.ttLib import TTFont

fonts = Path("apps/web/public/fonts")
source = fonts / "NotoSansTC-ui.woff2"
coverage = set(TTFont(source).getBestCmap())
texts = []
for locale in ("en", "zh-CN", "zh-HK"):
    messages = json.loads(
        (Path("apps/web/locales") / locale / "common.json").read_text()
    )
    texts.extend(value for value in messages.values() if isinstance(value, str))
    texts.extend(messages["nav"].values())
    texts.extend(messages["status"].values())
    texts.extend(messages["run"]["status"].values())
common = {ord(char) for text in texts for char in text} & coverage

def ranges(points):
    points = sorted(points)
    first = previous = points[0]
    output = []
    for point in points[1:]:
        if point == previous + 1:
            previous = point
            continue
        output.append(f"U+{first:04X}" + (f"-{previous:04X}" if first != previous else ""))
        first = previous = point
    output.append(f"U+{first:04X}" + (f"-{previous:04X}" if first != previous else ""))
    return ",".join(output)

for name, points in (("common", common), ("remaining", coverage - common)):
    font = TTFont(source, recalcTimestamp=False)
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
    target = fonts / f"NotoSansTC-ui-{name}.woff2"
    font.save(target)
    assert set(TTFont(target).getBestCmap()) == points
    print(name, target.stat().st_size, hashlib.sha256(target.read_bytes()).hexdigest())
    print("unicode-range:", ranges(points))
PY
```

UI parity expands the remaining subset by 174 mappings from the approved full
`docs/ui/prototype/vendor/NotoSansTC.ttf` (SHA-256
`864727d210d54f2537bbe23b3a839436c3992af72de9322af5270897246bd44f`).
The union covers 714 mappings, including every source-supported Han character
in the prototype fixture definitions. All 369 prior mappings and metrics are
preserved, verified against source outlines and widths at weights
100/300/400/500/600/900 with FontTools 4.66.1 and Brotli 1.2.0. The common
subset stays unchanged. The added 55,060 bytes are included in performance
validation. The approved TC source lacks 87 Simplified Chinese fixture
characters; these retain the existing system fallback.

To regenerate, take the union of the previous remaining cmap and Han characters
in `packages/schemas/src/prototype-data.ts`, `packages/core/src/prototype-seed.ts`
and `packages/core/src/seed.ts`, intersect with the full source cmap, then remove
the common cmap. Subset that source with FontTools retaining layout features,
glyph names and the variable axis, and set WOFF2 flavor explicitly. The CSS
Unicode range must match that resulting cmap exactly.

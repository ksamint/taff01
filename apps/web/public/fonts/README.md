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

The runtime Unicode split preserves exactly 714 mappings: the original UI
subset's 540 plus 174 source-supported mappings from the approved full
`docs/ui/prototype/vendor/NotoSansTC.ttf` (SHA-256
`864727d210d54f2537bbe23b3a839436c3992af72de9322af5270897246bd44f`).
Those additional mappings support prototype content in the shared seed manifest.
The approved TC source lacks 87 Simplified Chinese fixture characters; these
retain the existing system fallback.

The two runtime assets use the same Noto Sans TC family, CSS weight range
300–600 and `font-display: optional`. Both retain the actual `fvar` weight axis
of 100–900; CSS advertises the narrower range used by the application.

| Asset | Unicode mappings | Bytes | SHA-256 |
| --- | ---: | ---: | --- |
| NotoSansTC-ui-common.woff2 | 247 | 70,716 | `37ad32a472c41f4437229203438fa50c74a87d9ad58130ef48795ee138e989bf` |
| NotoSansTC-ui-remaining.woff2 | 728 | 224,900 | `d5608a4e557d0a05206365b66752c7bea50d2548799142e7941f9aa1d18af283` |

**M19 v2 regeneration (2026-10-14).** The subsets were regenerated from the v2
strings. Coverage is the previous 714 mappings plus every character the approved
TC source supports in: all strings of the three locale dictionaries, hard-coded
non-Latin text in `apps/web/src` and `apps/web/app` (tests excluded), the shared
seed content (`packages/schemas/src/prototype-data.ts`,
`packages/core/src/prototype-{mind,seed}.ts`, `packages/core/src/seed.ts`) and
the Intl date text below. That adds 261 mappings (975 in total), including
`↔`, `⌘`, `「」` and `；`. Characters that Manrope-latin already draws
(`–—“”›−`) are not added: Manrope precedes Noto Sans TC in the font stack, so
those Noto glyphs would never render. The `initials.ts` regex bounds U+3400 and
U+9FFF are not text. The TC source lacks 173 Simplified Chinese characters used
by zh-CN strings and zh-CN seed content; these keep the system fallback.
The common promotion now selects 49 more characters
(`七不並五使側內全六受址处如展并忽息所拥接提擁星是時查欄權此母獲略看确確英處訊認證透這通連邀部閒非驗`),
38 of which moved from the remaining asset. The remaining asset is the exact
complement. All 714 earlier mappings keep identical outlines and
horizontal/vertical metrics at weights 100, 300, 400, 500, 600 and 900; the
procedure below with the earlier coverage and split reproduces the earlier
assets byte for byte. The combined size grows from 219,496 to 295,616 bytes.
The four font faces are unchanged, so `scripts/ui/prepare-fonts.ts` still
expects four.

The common set retains every prior common mapping. It contains supported
characters from top-level strings, navigation labels, task/run statuses and
literal translation keys used by Today in all three dictionaries. It also
contains every supported character in locale date text: all twelve months,
all seven weekdays and all month-day values, using Intl numeric, short, long,
narrow and date-style formats. These are generic UI/date strings; task titles,
member names and fixture-specific performance text do not select this promotion.
The 27 promoted characters are `、三二再區周四圍填多尋小年搜數月現用程稱範索縮范週過選`.
The remaining set is the exact complement. Their disjoint CSS Unicode ranges
match their cmaps and cover all 714 mappings without expanding font coverage.

This promotion was made locally with FontTools 4.66.1 and Brotli 1.2.0 (MIT),
reusing the approved full source and temporary tools, with no download or runtime
dependency. All 714 outlines and horizontal/vertical metrics were compared with
the preceding runtime assets at weights 100, 300, 400, 500, 600 and 900 and matched
exactly. Units per em, line metrics and variable axes also match. The previous
171/543 mapping split used 47,620/169,500 bytes; the new combined size is 219,496
bytes (2,376 more): common grows by 9,272 bytes and remaining shrinks by 6,896
bytes. Optional display controls swapping; matching fonts still
consume bandwidth. Browser request/performance evidence belongs to the release
checks; the offline character check does not establish a cold-page measurement.

The common asset omits the full source's seven-byte `prep` program (SCANCTRL
511 / SCANTYPE 4), matching the preceding Google-derived common asset's raster
control tables. Every glyph instruction program is empty and there are no `cvt `
or `fpgm` tables. The only removed table is `prep`; all retained tables are
byte-identical to the expanded common asset apart from the derived `head` checksum
adjustment. Its GSUB/GPOS tables, 198 mappings, outlines, metrics and axes remain
unchanged. The remaining asset retains its existing source raster controls and
is byte-for-byte unchanged. This is a source-preservation repair; it does not
claim a browser pixel comparison pass. WOFF2 compression makes the common asset
32 bytes larger despite removing that small table.

Regenerate from the repository root using those tool versions. The existing
runtime cmaps are the minimum coverage; retain their union and extend it as in
the M19 note above. Node 24's Intl
provides the date strings, independently of task data. This prints new CSS ranges,
which must be updated together with both assets:

```sh
node --input-type=module - <<'JS' > /tmp/taff-font-date-text.json
const texts = [];
for (const locale of ['en', 'zh-CN', 'zh-HK']) {
  for (const month of ['numeric', '2-digit', 'short', 'long', 'narrow']) {
    for (const weekday of ['short', 'long', 'narrow']) {
      const formatter = new Intl.DateTimeFormat(locale, {
        timeZone: 'UTC', year: 'numeric', month, weekday, day: 'numeric',
      });
      for (let day = 0; day < 366; day++)
        texts.push(formatter.format(new Date(Date.UTC(2024, 0, 1 + day))));
    }
  }
  for (const dateStyle of ['full', 'long', 'medium', 'short']) {
    const formatter = new Intl.DateTimeFormat(locale, {timeZone: 'UTC', dateStyle});
    for (let day = 0; day < 366; day++)
      texts.push(formatter.format(new Date(Date.UTC(2024, 0, 1 + day))));
  }
}
console.log(JSON.stringify([...new Set(texts)]));
JS
python - <<'PYFONT'
from pathlib import Path
import hashlib
import json
import re
from fontTools import subset
from fontTools.ttLib import TTFont

fonts = Path("apps/web/public/fonts")
source = Path("docs/ui/prototype/vendor/NotoSansTC.ttf")
previous_common = set(TTFont(fonts / "NotoSansTC-ui-common.woff2").getBestCmap())
coverage = previous_common | set(
    TTFont(fonts / "NotoSansTC-ui-remaining.woff2").getBestCmap()
)
assert len(coverage) >= 975
manrope = set(TTFont(fonts / "Manrope-latin.woff2").getBestCmap())
source_cmap = set(TTFont(source).getBestCmap())

def walk(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from walk(child)

v2 = json.loads(Path("/tmp/taff-font-date-text.json").read_text())
for locale in ("en", "zh-CN", "zh-HK"):
    v2.extend(walk(json.loads(
        (Path("apps/web/locales") / locale / "common.json").read_text()
    )))
for path in [
    *(p for folder in ("apps/web/src", "apps/web/app")
      for p in Path(folder).rglob("*")
      if p.suffix in (".ts", ".tsx") and ".test." not in p.name),
    Path("packages/schemas/src/prototype-data.ts"),
    Path("packages/core/src/prototype-mind.ts"),
    Path("packages/core/src/prototype-seed.ts"),
    Path("packages/core/src/seed.ts"),
]:
    v2.append(path.read_text())
wanted = {ord(c) for text in v2 for c in text if ord(c) > 0xFF} - {0x3400, 0x9FFF}
coverage |= (wanted & source_cmap) - manrope
texts = json.loads(Path("/tmp/taff-font-date-text.json").read_text())
keys = set(re.findall(
    r't\("([\w.]+)"',
    Path("apps/web/src/components/today-view.tsx").read_text(),
))
for locale in ("en", "zh-CN", "zh-HK"):
    messages = json.loads(
        (Path("apps/web/locales") / locale / "common.json").read_text()
    )
    texts.extend(value for value in messages.values() if isinstance(value, str))
    texts.extend(messages["nav"].values())
    texts.extend(messages["status"].values())
    texts.extend(messages["run"]["status"].values())
    for key in keys:
        value = messages
        for part in key.split("."):
            value = value[part]
        assert isinstance(value, str)
        texts.append(value)
common = previous_common | ({ord(char) for text in texts for char in text} & coverage)

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
    return ", ".join(output)

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
    font.flavor = "woff2"
    target = fonts / f"NotoSansTC-ui-{name}.woff2"
    font.save(target)
    if name == "common":
        # Match the original Google UI common raster controls. Round-trip the
        # expanded subset first so the only subsequent table removal is prep.
        font = TTFont(target, recalcTimestamp=False)
        assert "cvt " not in font and "fpgm" not in font
        assert all(
            not (getattr(font["glyf"][glyph], "program", None)
                 and font["glyf"][glyph].program.getBytecode())
            for glyph in font.getGlyphOrder()
        )
        del font["prep"]
        font.save(target)
    assert set(TTFont(target).getBestCmap()) == points
    print(name, len(points), target.stat().st_size, hashlib.sha256(target.read_bytes()).hexdigest())
    print("unicode-range:", ranges(points))
PYFONT
```

**v0.2.1 supplements (2026-10-15).** The reported 173 missing mappings are
172 Simplified CJK characters and U+21B3 (`↳`). The CJK supplement uses official
Google Fonts Noto Sans SC; the single arrow uses official Noto Sans Math because
neither Noto Sans TC, SC, Symbols nor Symbols 2 contains it. Both retain their
upstream SIL Open Font License 1.1 beside the assets. No runtime dependency or
external font request is added.

`v021-subsets.json` records pinned upstream URLs, full-source SHA-256 values,
asset SHA-256 values, exact Unicode ranges and sizes. Rebuild with FontTools
4.66.1 and Brotli 1.2.0 (MIT), in a temporary Python environment:

```sh
python scripts/ui/subset-fonts.py /path/to/NotoSansSC.ttf /path/to/NotoSansMath.ttf
pnpm exec biome check --write apps/web/src/styles/tokens.css
pnpm test scripts/ui/fonts.test.ts
```

Download the sources from the manifest's pinned URLs; the script rejects a
source with a different hash. The original 247-glyph TC common asset stays
byte-for-byte unchanged. The other 728 TC mappings split into a 723-glyph
224,236-byte CJK asset and a five-glyph 2,304-byte symbols asset. All 728 original
outlines and advances match the earlier asset at weights 100, 300, 400, 500, 600
and 900. The 172-glyph SC supplement is 54,036 bytes; the one-glyph Math supplement
is 2,852 bytes. CSS ranges are disjoint across these TC-family faces. The static Math arrow
uses the same CSS weight descriptor as its sibling Unicode faces; its outline
stays constant across that range.

English Relations previously downloaded the 224,900-byte CJK asset solely for
`↔`. It now requests the 2,304-byte symbols face. The visual Relations test
asserts that English requests this face and does not request the remaining CJK
asset. `prepare-fonts.ts` checks all seven installed CSS faces and only prepares
faces the browser actually selected, preserving this network check. User text
containing Chinese can still legitimately request CJK assets.

For dark locale route captures, run `UI_THEME=dark pnpm ui:app-shots <output>`.
The same 186-view route matrix covers all three locales and both viewports;
the manifest records the theme. The native visual capture workflow also records
60 dark baselines for the ten v2-only screens, in addition to the 126 light
baselines, without changing existing comparison tolerances.

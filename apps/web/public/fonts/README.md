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

NotoSansTC-ui.woff2 is a 300–600 variable UI subset of Noto Sans TC, downloaded
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

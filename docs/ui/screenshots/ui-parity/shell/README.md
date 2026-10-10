# Shell visual evidence

The root agent accepted these six native app element captures at `dfcbefb`
after inspecting each image. App PNGs here and the corresponding files in
`e2e/__screenshots__/ui-parity.spec.ts/` are byte-identical copies. Phone
projects use a 390 × 844 viewport; desktop projects use 1280 × 800.
Behavioral and committed-baseline validation remain pending.

At `8489383`, the root agent separately inspected and approved four corrected
tab/sidebar captures using the installed Manrope and Noto Sans TC faces.
The prior optional-font renders selected Linux fallback fonts. The capture-only
helper loads equivalent faces from the actual stylesheet before capturing;
production font policy and cold-load performance checks are unchanged. The
manifest records the replacement hashes; FABs and reference crops are unchanged.

The reference inputs are the existing offline captures in
[`docs/ui/reference`](../../../reference/README.md). Their Chinese filename
is `zh`; the prototype's Hong Kong Chinese content maps to app project
`zh-HK`. Reference crops use top-left native pixel coordinates:

| Region | Reference input, for each language | Crop `(x, y, width, height)` |
| --- | --- | --- |
| Phone tab controls | `phone-{en,zh}-today.png` | `(0, 760, 390, 56)` |
| Phone FAB | `phone-{en,zh}-today.png` | `(318, 692, 52, 52)` |
| Desktop sidebar | `desktop-{en,zh}-projects.png` | `(0, 0, 208, 800)` |

The 56 px phone tab crop excludes the source's 28 px synthetic OS home
area. The source's rounded outer edge remains visible where it intersects
the tab crop; the app does not reproduce the simulated device chrome.
The FAB crops omit external shadow pixels equally with the app's element
screenshots. No source image was resized, recolored or reconstructed.

Crops were extracted with macOS ImageIO `CGImage.cropping(to:)`, using
`CGRect(x: x, y: y, width: width, height: height)` and writing PNG via
`CGImageDestination`. The [manifest](manifest.json) records every original
reference hash, crop rectangle, crop hash and app/baseline hash. Full
reference capture provenance remains in the original reference manifest.

The source markup, not these images, drives implementation: phone shell
HTML lines 376–410 and desktop sidebar lines 940–953. Accepted differences
are the standing 44 px target / 12 px text floors, actual API unread count
four rather than the prototype's three, actual run status dots, and the
desktop Today / Calendar / Me utility links. No synthetic badge counts or
agent state were introduced for visual matching.

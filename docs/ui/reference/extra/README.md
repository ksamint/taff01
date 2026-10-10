# Additional prototype references

Run `pnpm ui:prototype-shots --extra` for this separate matrix. An optional
output directory follows the flag; the runner rejects the approved light
or dark destination and does not combine `--extra` with `--dark`.
The default 38 light views and bounded six-view dark mode are unchanged.

Each of the six phone views is captured in Hong Kong Chinese (`zh`) and English
at native 390 × 844, from a fresh page. Desktop Quick Add is also captured
in both languages at native 1280 × 800. Navigation uses the actual calendar
Week/Month buttons, Projects List tab, Me Notifications/Team rows, and
Quick Add FAB, and desktop New task button. The runner does not fabricate view state or edit source
markup/styles. It retains the existing supported slow-speed editor prop,
frozen simulation, initial task assertions, local fonts and surrounding
canvas normalization.

| View | Source HTML block / control |
| --- | --- |
| Calendar week and month | 115–222; actual segmented view buttons |
| Projects list | 223–279; actual List tab |
| Notifications | 613–635; Me notification row |
| Team | 667–710; Me team row |
| Phone Quick Add | 794–812; existing phone FAB |
| Desktop Quick Add | 1137–1155; existing desktop New task button |

All 14 captures were personally inspected. The completed run verified
native PNG dimensions, selected week/list controls, month cells,
notification switches, visible Quick Add textarea and expected localized
view content, including the desktop modal over the real board and task pane.
It recorded zero external requests and browser errors. The twelve phone PNGs
were byte-identical to the existing references and were not overwritten;
only the two desktop PNGs were added. The original 38 light and six dark
reference PNGs remain unchanged.
Full PNG/source hashes, browser version, rendered light theme, loaded fonts
and asserted task state are in [manifest.json](manifest.json);
[capture-status.json](capture-status.json) records its manifest hash.

These are prototype references, not real app behavior or acceptance gates.
Phone synthetic OS status/home chrome and rounded corners remain visible;
native crops may normalize them for product comparisons. Team and other
long content retain the source's initial scroll position, rather than
extending the viewport. No missing desktop layouts were invented.

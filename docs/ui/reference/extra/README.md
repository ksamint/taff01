# Additional phone prototype references

Run `pnpm ui:prototype-shots --extra` for this separate matrix. An optional
output directory follows the flag; the runner rejects the approved light
or dark destination and does not combine `--extra` with `--dark`.
The default 38 light views and bounded six-view dark mode are unchanged.

Each of the six views is captured in Hong Kong Chinese (`zh`) and English
at native 390 × 844, from a fresh page. Navigation uses the actual calendar
Week/Month buttons, Projects List tab, Me Notifications/Team rows, and
Quick Add FAB. The runner does not fabricate view state or edit source
markup/styles. It retains the existing supported slow-speed editor prop,
frozen simulation, initial task assertions, local fonts and surrounding
canvas normalization.

| View | Source HTML block / control |
| --- | --- |
| Calendar week and month | 115–222; actual segmented view buttons |
| Projects list | 223–279; actual List tab |
| Notifications | 613–635; Me notification row |
| Team | 667–710; Me team row |
| Quick Add | 794–812; existing phone FAB |

All 12 captures were personally inspected. The completed run verified
native PNG dimensions, selected week/list controls, month cells,
notification switches, visible Quick Add textarea and expected localized
view content. It recorded zero external requests and browser errors.
Full PNG/source hashes, browser version, rendered light theme, loaded fonts
and asserted task state are in [manifest.json](manifest.json);
[capture-status.json](capture-status.json) records its manifest hash.

These are prototype references, not real app behavior or acceptance gates.
Phone synthetic OS status/home chrome and rounded corners remain visible;
native crops may normalize them for product comparisons. Team and other
long content retain the source's initial scroll position, rather than
extending the viewport. No missing desktop layouts were invented.

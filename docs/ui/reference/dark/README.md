# Dark prototype references

Run `pnpm ui:prototype-shots --dark` to capture this bounded dark matrix.
An optional output directory follows the flag. Dark mode defaults here and
rejects the approved light-reference destination; the 38 light PNGs and
their manifest remain unchanged.

Each fresh page switches appearance using the prototype's actual **Me →
Dark** control, then navigates to the target view. The runner asserts the
rendered phone and desktop background matches the source dark theme, rather
than relying on operating-system color-scheme emulation. It preserves the
existing frozen simulation, initial task state, offline request rejection,
font checks, native dimensions and browser-error assertions.

| Views | Languages | Native dimensions |
| --- | --- | --- |
| Phone Projects | Hong Kong Chinese (`zh`) and English | 390 × 844 |
| Desktop board and list | Hong Kong Chinese (`zh`) and English | 1280 × 800 |

All six captures were personally inspected. The runner completed with zero
external requests and browser errors. [Manifest](manifest.json) records
full PNG/source hashes, actual theme/background, installed browser version,
loaded fonts, local resources and asserted task state; [capture status](capture-status.json)
records its manifest hash. These are prototype references, not app acceptance
or behavioral gate results.

Phone images retain the source's simulated OS status/home chrome and rounded
corners. Desktop board/list retain the source's initially selected NW-141
review panel. The prototype still provides no desktop Today, Calendar, Me,
MCP or agent-profile screen; dark capture does not invent those layouts.

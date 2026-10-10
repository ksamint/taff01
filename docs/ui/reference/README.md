# Approved prototype reference captures

Regenerate from the repository root with `pnpm ui:prototype-shots`. The script
serves the prototype itself on an ephemeral loopback port, closes the browser
and server, and requires no account, application service or Internet access.
Every browser request outside that origin is blocked and fails the run.

Each PNG captures the actual named screen element at device scale 1. Phone
surfaces are **390 × 844**, desktop surfaces **1280 × 800**; no image scaling is
used. The surrounding design canvas, captions and outside phone bezel are
excluded. The prototype's synthetic OS status bar, home indicator and rounded
screen corners remain visible. These are capture chrome absent from the real
app; product controls, typography and layout are preserved.

| Surface | Phone zh / en | Desktop zh / en |
| --- | --- | --- |
| Today | `phone-{zh,en}-today.png` | Not provided by prototype |
| Calendar | `phone-{zh,en}-calendar.png` | Not provided by prototype |
| Projects | `phone-{zh,en}-projects.png` | `desktop-{zh,en}-projects.png` (board) |
| Inbox | `phone-{zh,en}-inbox.png` | `desktop-{zh,en}-inbox.png` |
| Me | `phone-{zh,en}-me.png` | Not provided by prototype |
| Task detail (NW-145) | `phone-{zh,en}-task-detail.png` | `desktop-{zh,en}-task-detail.png` |
| Review (NW-141) | `phone-{zh,en}-review.png` | `desktop-{zh,en}-review.png` (Inbox + right pane) |
| Research Agent profile | `phone-{zh,en}-agent-profile.png` | Agent links filter the board; no desktop profile |
| MCP | `phone-{zh,en}-mcp.png` | No desktop MCP view; palette links open the phone stack |
| Search | `phone-{zh,en}-search.png` | `desktop-{zh,en}-search.png` (command palette) |
| Organization chooser | `phone-{zh,en}-organizations.png` (sheet) | `desktop-{zh,en}-organizations.png` (menu) |
| Desktop board | Phone Projects provides the native board | `desktop-{zh,en}-board.png` |
| Desktop list | Phone Projects defaults to board | `desktop-{zh,en}-list.png` |

The desktop board and Projects captures intentionally depict the same supported
view. Inbox and review share the initially selected NW-141 detail pane. They
are named by navigation intent, not falsely presented as different layouts.
The prototype only defines five tabs on its phone surface; missing desktop
views are explicitly recorded instead of substituting a repeated canvas.

Every capture starts with fresh storage and the initial Northwind seed:
October 8 at 11:20, NW-138 working at 2/4; NW-141 and NW-142 need review;
NW-144 blocked. Board counts: todo 3, in progress 4, review 2, done 3;
Inbox badge 3. There is no toast in this initial state. Simulation time is
paused; timers of at least one second are frozen, while bounded short UI, focus
and persistence ticks remain enabled. This also prevents the initial render
from advancing its already-scheduled default progress timer before the supported
slow-speed prop applies. The saved task status and progress are asserted for
every frame.
English is selected using the actual Me language control. No seed data or
product state is fabricated for a capture.

`manifest.json` records PNG SHA-256 hashes, dimensions, asserted navigation
state, browser version, font loading, all local resource paths and source asset
hashes. `capture-status.json` must say `complete` and match the manifest hash.
A failed run writes `failed`, removes the previous manifest, exits nonzero and
cannot be mistaken for a new successful capture. The runner asserts the view
container and localized text, rejects browser/network errors, and verifies PNG
headers. React 18.3.1 is MIT; Noto Sans TC and Manrope use SIL OFL 1.1, with
licences and source hashes under `../prototype/vendor/`.

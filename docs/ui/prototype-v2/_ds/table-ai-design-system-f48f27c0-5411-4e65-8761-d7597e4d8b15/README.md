# TABLE AI — Design System

**TABLE AI** is an Expert-AI Studio and an Agent-to-Agent (A2A) alliance and international think tank: "Global Collaborative Infrastructure Bridging Intelligence and the Real Economy" (跨越智能与实体经济边界的全球协同基础设施). Its thesis: AI agents stall at two thresholds — **Trust** (no zero-trust data circulation and settlement) and **Experience** (pure algorithms can't carry professional depth and accountability). TABLE AI answers with the **AHA architecture** (Agent–Human–Assets) and a **1 + 1 + X** business matrix: a zero-trust compliance settlement system, the **OPC Global** human-in-the-loop expert network (Hong Kong · London · Basel · North America · Beijing · Shanghai · Shenzhen · Macau), and X benchmark AI-transformation scenarios (compliant business travel, space-asset scheduling, research commercialization).

The visual identity is an "international think-tank" register: white ground, **Universe Deep Blue** structure, a sliver of **Sundial Dark Gold**, Manrope, hairlines, and the round-table motif (concentric rings with gold nodes). The brand describes itself with four words: 利他 Altruistic · 真实 Authentic · 艺术 Artistic · 优雅 Elegant.

## Company context (seed plan, Oct 2026)

The Table AI seed business plan (Traditional Chinese, 5 Oct 2026, @Dakota Lopez) positions the operating company **香港泰博樂科技有限公司** as an **Expert-AI Studio (專家 AI 工作室)**: it turns industry experts' decision paths into deployable enterprise AI agents, training/eval data, and accountable decision benchmarks. The model proven in the restaurant industry is being extended to high-value sectors such as financial IT. Website: tableai.ai (currently a placeholder).

- **Products:** Expert Agent 專家智能體 (human-in-the-loop sign-off) · Expert Data & Rubrics 專家數據與評分標準 (SFT/RL data, decision rules, 繁/簡/EN corpora) · Expert Evals 專家評測集 (auditable benchmarks for agent acceptance and compliance). Every output is signed by a named expert.
- **Validated prototype:** 侍天 Tiansight (tiansight.apuch.cn) — restaurant diagnostics → coaching → "second brain" system, 8+ signed brands.
- **Pricing ladder:** Diagnosis/Eval → Coaching/Data subscription → Agent deployment + outcome fee.
- **Structure:** Hong Kong operating company; Swiss AG (Lausanne/Vaud) planned at month 9–12. Expert network via **OPC Global**.

The design-system repo predates this framing and describes Table AI as an A2A alliance / think tank (below). The visual system applies unchanged; for investor and enterprise materials, use the Expert-AI Studio vocabulary from the plan. **Chinese copy is Traditional (Hong Kong usage)** across the system: 繁體 characters, 「」 quotation marks, Noto Sans TC. This design system is brand guidance, not a client proposal: never include client names, deal status, prices or fundraising terms in system assets.

## Sources

Ground truth (attached): **https://github.com/ksamint/dsys_tableai** — `TABLEAI/TableAI_DESIGN.md` (philosophy, palette, layout rules, component states; Chinese), `TABLEAI/tokens/tableai.tokens.json` (W3C DTCG tokens), `data/brand.json` / `data/theme.json` / `data/assets.json` (IPTrust brand record, asset manifest with media URLs). Seeded from https://github.com/ksamint/tableai_designaha/tree/main/TABLEAI; published IP page https://apuch.art/brand?brand=tableai.

Product source used for the UI kits, copy and iconography: **https://github.com/ksamint/table-ai-website** (private; the TABLE AI official website + bilingual CMS admin, built with Manus). Read: `client/src/index.css`, `components/{Navbar,Footer,AIChatBox,AdminLayout}.tsx`, `pages/{Home,ProtocolPage,NetworkPage,BusinessPage,AboutPage}.tsx`, `pages/admin/AdminDashboard.tsx`, `server/seed.ts`, `design-notes.md`. Not read: `components/ui/*` (stock shadcn), `WorldMap.tsx`, other admin pages.

Third-party: Manrope from https://github.com/google/fonts (OFL), Lucide icons from https://github.com/lucide-icons/lucide (ISC). Readers with access can explore those repositories to go deeper — especially `table-ai-website` for real layouts and CMS content.

**Source conflicts, resolved:** the website ships Inter + pure neutral greys (`oklch(0.12 0 0)` text, 8px radii); the design-system repo mandates Manrope, Deep Blue `#0A1626`, Gold `#A88B52`, 2–4px radii. This system follows the design-system repo and applies it to the website's real layouts and copy. `TableAI_DESIGN.md` front-matter lists a Material-style palette with `primary: #000000` — treated as an export artefact; Deep Blue is the primary.

## Brand architecture

- **TABLE AI** — master brand. Lead positioning: Expert-AI Studio 專家 AI 工作室.
- **Products** (generic descriptors, not sub-brands): Expert Agent 專家智能體 · Expert Data & Rubrics 專家數據與評分標準 · Expert Evals 專家評測集.
- **Frameworks** (explanatory, set in plain type, never with their own mark): AHA (Agent–Human–Assets) · 1+1+X · L.I.D.
- **Endorsed partners/programmes:** OPC Global (expert network), 侍天 Tiansight (restaurant prototype). Name them in copy; do not lock up their marks with the TABLE AI mark.
- Order of story on any surface: Studio → proof (Tiansight) → infrastructure (AHA, 1+1+X) → network (OPC Global).

## Content fundamentals

- **Bilingual by design.** Every string exists as 繁體中文 + English (`titleZh/titleEn`). Chinese is the source language (Traditional, Hong Kong usage, 「」 quotes; the original website seed was Simplified and has been converted); English is a faithful, formal translation. UI keeps a bordered `EN` / `中` toggle in the header. Typography rules apply to both; Chinese never gets letter-spacing — components use `--ls-track-*` tokens, which reset to 0 under `:lang(zh)`, so set `lang="zh-Hant-HK"` on the page or section.
- **Register: institutional, declarative, third person.** "TABLE AI is committed to building the infrastructure for the next-generation intelligent economy." Never "we're", never exclamation marks, never emoji. "We" appears only in mission statements ("we fundamentally bridge the trust and experience divide"); the reader is never addressed as "you" on the public site.
- **Long, precise sentences with defined terms.** Coined terms are quoted or capitalised on first use: 'usable but invisible', Zero-Trust, Human-in-the-loop, the 'protocol layer'. Compliance references are named exactly (CAICT trusted computing standards, global multilateral tax compliance).
- **Numbered structure.** Sections are prefixed "01 —", "02 —", "03 —"; the business model is literally "1+1+X"; pillars are "The First '1'", "The Second '1'", "The Multiplier 'X'"; labs are X1, X2, X3.
- **Casing.** Eyebrows: UPPERCASE via CSS, 0.3em tracking ("GLOBAL COLLABORATIVE INFRASTRUCTURE"). Headlines: Title Case in English ("Crossing the Trust Threshold"). Buttons: Title Case, short verb phrases ("Explore AHA Architecture", "Learn More", "Discover TABLE AI"). Wordmark: always "TABLE AI" in caps with 0.1em tracking.
- **Numbers as proof.** Stats are terse and tracked: "7+ Global Hub Nodes", "100% Instant Auto Settlement", "AHA Foundation Architecture". Founded 2026. Contact: hi@tableai.ai.
- **Admin voice** is plain product English: "Manage bilingual website content", "Seed the database with default TABLE AI content", "Welcome back, Admin".
- **Vibe:** investor-grade, calm, confident, slightly academic. Sparse copy inside generous whitespace; grids and hairlines do the structuring rather than prose.

## Visual foundations

- **Colors.** White `#FFFFFF` is the ground (large negative space "is the source of lightness"). Universe Deep Blue `#0A1626` is text, rules, the brand mark and dark panels (`#101C2C` soft, `#3C4759` borders-on-dark). Sundial Dark Gold `#A88B52` is capped at ≈8% of visible area: the one conversion CTA on a view, active/focus states (gold border or 8% "gold mist" wash), a single key figure, fine decorative lines; `#785F2A` when gold must be text on white. Neutrals: ink `#1B1B1D` (body), ink-variant `#44474C` (secondary), outline `#75777D`, outline-variant `#C5C6CD` (hairlines), surfaces `#FBF9FA` → `#E4E2E3` (warm off-whites). Error `#BA1A1A` only. Never gradients as fills; never coloured left borders.
- **Type.** Manrope for everything (variable 200–800), Noto Sans TC for 繁體中文 (SC fallback). Display: 300 weight, `clamp(40px,7vw,96px)`, line-height 0.95, −0.03em. Section h2: 300 weight, 32–48px, −0.025em, second line in ink-variant. Token scale: headline-xl 40/700 −0.02em · lg 32/600 · md 24/600 · body-lg 18/1.6 · body-md 16/1.6 · label-sm 12/600 +0.05em. Eyebrow 12px uppercase 0.3em; nav 13px 0.025em; language toggle 11px 0.15em; footer column heads 12px 0.2em. Numerals light (300), tabular, −0.03em; big decorative letters (A/H/A, X1) at 200 weight and 15–20% opacity.
- **Spacing & layout.** 8px grid (xs 4 · sm 8 · md 16 · lg 24 · xl 40 · xxl 80). Sections 96–128px vertical padding (CTA sections up to 176px); containers 1152–1280px with 20/32/40px gutters; 4/8 and 7/5 column splits; sticky eyebrow in the left column. Header 64px (80px desktop), fixed, transparent over the hero, then glass (white 70%, 20px blur, hairline) after 50px scroll. Thin 2px deep-blue scroll-progress bar at the top.
- **Backgrounds.** Flat white. Faint 60px grid lines (`rgba(10,22,38,.06)`) behind heroes and CTAs at 25–40% opacity; hairline rings (300px circle, rotated square) as floating geometry; 3% fractal-noise overlay on tinted sections; tinted sections are 50% `#F0EDEF`. One photographic hero (the round table) — bright, cool, white-on-white with deep-blue and gold accents, no grain, no people.
- **Borders & cards.** Everything is hairline `1px #C5C6CD`. Cards are square, white, bordered; "tile grids" are cells on a 1px border-coloured background (`gap:1px`). No drop shadows at rest; the only shadow is the lift on hover of stand-alone cards (`0 20px 60px -15px rgba(10,22,38,.08)`). Dividers: full hairline; 48px accent mark (`.accent-line`); gold 48–64px closer under CTA titles.
- **Radii.** Square by default (cards, tiles, tables). 2px for controls (buttons, inputs, tags, badges); 4px for dialogs, toasts and chat bubbles; full radius only for the switch, avatars and map dots.
- **Heading roles.** Marketing surfaces (site, decks, documents) use light 300 headings (`--type-marketing-*`); product UI (admin) uses semibold 600 (`--type-product-*`).
- **Status colours** (product UI only): success `#2F5D4E`, warning `#8A5A12`, error `#BA1A1A`, each with a pale container. Never on marketing surfaces.
- **States** (design.md §4). Default: deep-blue text/border on white. Hover: colour deepens slightly or a 1px gold line appears (outline buttons get `inset 0 -1px 0 gold`); cards lift 2–4px and borders darken to `#75777D`; links grow a 1px underline from the left. Active/pressed: gold border + gold-mist wash, scale 0.98. Focus: 2px gold outline, 2px offset, keyboard only (`:focus-visible`); token `--focus-ring-width`. Disabled: 45% opacity. Loading/empty: minimal deep-blue skeleton (`rgba(10,22,38,.07)`, slow opacity pulse), or a hairline spinner ring — never complex animation.
- **Motion.** One easing, `cubic-bezier(0.16,1,0.3,1)` (expo-out). Durations 300/400/500ms for colour and lift; reveals 800ms (opacity 0→1, translateY 50→0, blur 6→0px) staggered 80–100ms per sibling; hairlines expand from the left over 1.2s; counters ease-out over 2s; scroll indicator drifts 8px. No springs, no bounces, no parallax in this system (the site used light parallax). `prefers-reduced-motion` disables all animation and transitions (base.css).
- **Transparency & blur.** Only in the glass header (white 70% + `blur(20px) saturate(180%)`) and the mobile menu (white 98% + 24px blur). Dialog scrim is deep blue at 45%.
- **Imagery.** The single brand hero and cropped details of it (rings, node dots, network sheets) are the imagery; UI echoes them with hairline rings, dots on orbits and 1px grids. No stock photography, no illustrations.

## Iconography

- **System:** Lucide (the set `table-ai-website` imports from `lucide-react`). 1.5px stroke, round caps/joins, `currentColor`, sizes 12 / 14 / 16 / 20. Forty SVGs are copied verbatim into `assets/icons/lucide/` (ISC licence alongside) and compiled into the `Icon` component's `ICON_PATHS`; usage: `<Icon name="arrow-right" size={16} />`. Add glyphs by copying more SVGs from lucide-icons/lucide and regenerating.
- **Usage patterns:** arrows are the brand's most used icons — `arrow-right` trails CTAs, `arrow-up-right` appears on card hover (top-right), `arrow-left` for "Back to Home", `chevron-down` for accordions. `sparkles` = agent, `user` = human, `globe` = hub, `users/cpu/zap` = network metrics, `shield` = admin, `layout-dashboard/file-text/map-pin/handshake/users/settings/log-out/external-link/database` = admin nav and actions. Icons are always muted (`--text-muted`) until hover, and never filled.
- **Not used:** emoji (never), icon fonts, PNG icons, coloured icon backgrounds. Unicode arrows (→, ↗) appear inline in tracked text links ("Details →").
- **Brand marks:** `assets/logo/tableai-a2a-mark.svg` — primary, vector, `fill="currentColor"`, cropped to the mark (traced programmatically from the PNG master; use `filter:invert(1)` or inline it with `color:#fff` on deep blue). PNG exports in `assets/logo/png/` (deep blue, white, gold; transparent and on-ground; 512/1024) and app icons in `assets/logo/favicon/` (32, 180, 192, 512). PNG masters: `assets/logo/tableai-a2a-logo-transparent.png` (1024², transparent, for light grounds; invert for deep blue) and `tableai-a2a-logo.png` (white background). The mark is an "A‖A" monogram in a broken ring. The website also references a CloudFront `table-ai-logo_467f1f04.png` that is no longer reachable — not included.

## Components

Compiled namespace: `window.TableAIDesignSystem_f48f27` (regenerated per project — check `_ds_manifest.json` if it changes). Each directory has `<Name>.jsx`, `<Name>.d.ts`, `<Name>.prompt.md` and one `@dsCard` HTML.

- `components/icons/` — **Icon** (+ `ICON_NAMES`, `ICON_PATHS`)
- `components/core/` — **Button**, **IconButton**, **Input** (+ **FieldLabel**), **Textarea**, **Select**, **Checkbox**, **Radio**, **RadioGroup**, **Switch**
- `components/display/` — **Card**, **TileGrid**, **Badge**, **Tag**, **Eyebrow**, **Stat**, **Divider**, **Skeleton**
- `components/navigation/` — **NavBar**, **Tabs**
- `components/feedback/` — **Dialog**, **ConfirmDialog**, **Toast**, **ToastStack**, **Tooltip**
- `components/a2a/` — **ChatMessage**, **ChatComposer** (from the website's `AIChatBox.tsx`)
- `components/data/` — **DataTable** (default / compact / comparison), **BarChart**, **DonutChart**
- `components/content/` — **Steps**, **Accordion**, **PersonCard**, **Quote**

Intentional additions (no counterpart in the attached repo, which defines states but no inventory): the standard control set above, sized to the brand; **Eyebrow / Stat / TileGrid / Divider** encode the website's signature patterns; **Icon** wraps the copied Lucide set; **ChatMessage / ChatComposer** carry the A2A conversation surface.

## Index

- `readme.md` — this guide · `SKILL.md` — agent skill entry · `github.md` — source association & sync receipt · `AGENT_TASKS.md` — open work for coding agents
- `styles.css` → `tokens/{fonts,colors,typography,spacing,radius,motion,base}.css` — all custom properties (`--color-*` base, semantic `--text/--bg/--border/--accent/--danger`, type, space, radius, motion) and `@font-face`
- `assets/fonts/Manrope[wght].ttf` · `assets/logo/` (mark SVG, wordmark SVG, horizontal + stacked lockups, PNG exports, favicons + `site.webmanifest`) · `assets/brand/tableai-brand-hero.jpg` (JPEG q86, 128 KB; PNG master at the `media.apuch.art` URL in `data/assets.json`) · `assets/icons/lucide/*.svg`
- `guidelines/` — 22 specimen cards: Colors (primary, deep-blue ramp, gold & 8% rule, neutrals, semantic, dark panel), Type (display, headlines, body, eyebrow, bilingual, numerals), Spacing (scale, layout, radii, hairlines), Brand (logo, wordmark, hero, motifs, states, motion)
- `components/` — see above
- `ui_kits/website/` — TABLE AI public site: Home (Expert-AI Studio first, then alliance/AHA/1+1+X), Studio, Protocol, Network, AI Labs, About; bilingual, hash-routed (`index.html`). Studio copy lives in `studio-content.jsx`, sourced from the seed plan
- `ui_kits/admin/` — TABLE AI admin panel: sidebar, dashboard, content/locations/partners, users, settings, login (`index.html`, `admin.jsx`, `screens.jsx` — Users/Settings/Login from AdminUsers/AdminSettings/AdminLogin.tsx)
- `templates/pitch-deck/` — 8-slide 16:9 deck (cover, problem, products, method, proof, figures, team, close)
- `templates/one-pager/` — A4 printable company overview
- `thumbnail.html` — homepage tile

## Caveats

- Noto Sans TC / SC are loaded from Google Fonts (binaries ≈10 MB/weight not shipped); Manrope ships as the OFL variable TTF.
- Brand images were retrieved from the public `media.apuch.art` URLs listed in `data/assets.json` (re-rasterised PNG, same pixel size). No SVG logo existed in the sources; `tableai-a2a-mark.svg` was traced programmatically from the PNG master — replace it if an original vector file turns up.
- The website's `WorldMap.tsx` and unread admin pages (Content/Locations/Partners/Users/Settings/Login) are not recreated pixel-for-pixel; see each kit's README.

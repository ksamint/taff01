// Accessibility audit of every v2 route (frontend v2 plan §7) against an
// isolated running app and its real seeded Northwind workspace. Each context
// is one route state × locale × phone/desktop × light/dark. It measures text
// contrast and size, effective phone target size, accessible names and a full
// keyboard tab cycle with a visible focus ring at every stop. Nothing is
// excluded: a failure is reported with its route, selector and measurement.
//
//   DEMO_PASSWORD=… node --env-file=.env scripts/ui/a11y-audit.mjs [out-dir]
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { prototypeId } from "../../packages/schemas/src/prototype-data.ts";
import { prepareTime } from "./prepare-time.mjs";

const out = path.resolve(process.argv[2] ?? "a11y-audit");
const base = process.env.AUTH_URL ?? "http://localhost:3000";
const email = process.env.DEMO_EMAIL ?? "alex@taff.local";
const password = process.env.DEMO_PASSWORD;
assert(password, "DEMO_PASSWORD is required; run against a seeded database");
const only = process.env.A11Y_ROUTE?.split(",");
const locales = process.env.A11Y_LOCALES?.split(",") ?? [
  "en",
  "zh-CN",
  "zh-HK",
];
const MAX_STOPS = 600;

const nw = (kind, key) => prototypeId(kind, "nw", key);
const project = prototypeId("project", "nw");
const task = nw("task", 145);
const reviewTask = nw("task", 141);
const agent = nw("member", 11);

/** Route states per §7; `desktop` / `phone` restrict a state to one column. */
function routes({ company, contact, digest }) {
  const openTask = (id) => async (page) => {
    await page
      .locator(`a.task-title-link[href="/tasks/${id}"]`)
      .first()
      .click();
    await expect(page.getByTestId("task-detail-heading")).toBeVisible();
  };
  return [
    { view: "signed-out", route: "/", signedOut: true },
    { view: "today", route: "/" },
    { view: "calendar", route: "/calendar" },
    { view: "projects", route: "/projects" },
    ...["board", "list", "timeline", "stakeholders", "relations", "mind"].map(
      (name) => ({
        view: `project-${name}`,
        route: `/projects/${project}?view=${name}`,
      }),
    ),
    { view: "companies", route: "/companies" },
    { view: "company-detail", route: `/companies/${company}` },
    { view: "contacts", route: "/contacts" },
    { view: "contact-detail", route: `/contacts/${contact}` },
    { view: "task-page", route: `/tasks/${task}` },
    { view: "task-sheet", route: "/projects", act: openTask(task) },
    { view: "review-page", route: `/tasks/${reviewTask}/review` },
    { view: "inbox", route: "/inbox", phone: true },
    { view: "inbox", route: "/me?tab=inbox", desktop: true },
    { view: "brief", route: "/brief", phone: true },
    { view: "brief", route: "/me?tab=brief", desktop: true },
    { view: "me", route: "/me" },
    { view: "me-agents", route: "/me?tab=agents", desktop: true },
    { view: "me-settings", route: "/me?tab=settings", desktop: true },
    { view: "agent", route: `/agents/${agent}` },
    { view: "mcp", route: "/me/mcp" },
    { view: "notifications", route: "/me/notifications" },
    { view: "orgs", route: "/orgs" },
    { view: "digests", route: "/digests" },
    { view: "digest-detail", route: `/digests/${digest}` },
    {
      view: "quick-add",
      route: "/",
      act: async (page) => {
        // Phone uses the floating button; desktop Today has 新任務.
        const fab = page.getByTestId("open-quick");
        await ((await fab.isVisible())
          ? fab
          : page.getByTestId("desktop-new-task")
        ).click();
        await expect(page.getByRole("dialog")).toBeVisible();
      },
    },
    {
      view: "search",
      route: "/",
      act: async (page) => {
        await page.keyboard.press("Control+k");
        await expect(page.getByRole("dialog")).toBeVisible();
      },
    },
  ];
}

// Runs in the page: text, target and focus-ring measurements.
function measure({ phone }) {
  const parse = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const [r, g, b, a = "1"] = match[1].split(/[,\s/]+/).filter(Boolean);
    return [Number(r), Number(g), Number(b), Number(a)];
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [
      top[0] * a + bottom[0] * (1 - a),
      top[1] * a + bottom[1] * (1 - a),
      top[2] * a + bottom[2] * (1 - a),
      1,
    ];
  };
  const luminance = ([r, g, b]) => {
    const c = [r, g, b].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const describe = (element) => {
    const parts = [];
    for (
      let node = element;
      node && parts.length < 4;
      node = node.parentElement
    ) {
      let part = node.tagName.toLowerCase();
      if (node.dataset?.testid) part += `[data-testid=${node.dataset.testid}]`;
      else if (node.classList.length)
        part += `.${[...node.classList].slice(0, 2).join(".")}`;
      parts.unshift(part);
      if (node.dataset?.testid) break;
    }
    return parts.join(" > ");
  };
  const visible = (element) => {
    // Content of a closed <details> or a content-visibility subtree is unrendered.
    if (!element.checkVisibility({ visibilityProperty: true })) return false;
    if (element.closest("[inert]")) return false;
    const rect = element.getBoundingClientRect();
    // Visually-hidden (sr-only) content is clipped to ≤1px and never painted.
    return rect.width > 1 && rect.height > 1;
  };
  const transparent = (element) => {
    for (let node = element; node; node = node.parentElement)
      if (Number(getComputedStyle(node).opacity) === 0) return true;
    return false;
  };
  /** Composited background, or null when an image/gradient paints it. */
  const background = (element) => {
    const layers = [];
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== "none") return null;
      const color = parse(style.backgroundColor);
      if (color && color[3] > 0) {
        layers.push(color);
        if (color[3] >= 1) break;
      }
    }
    let result = parse(getComputedStyle(document.body).backgroundColor);
    if (!result || result[3] < 1) result = [255, 255, 255, 1];
    for (const layer of layers.reverse()) result = over(layer, result);
    return result;
  };

  const text = { observations: 0, contrastFailures: [], small: [], manual: 0 };
  for (const element of document.body.querySelectorAll("*")) {
    if (
      ["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "svg"].includes(
        element.tagName,
      )
    )
      continue;
    const own = [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
    );
    if (!own || !visible(element) || transparent(element)) continue;
    // WCAG 1.4.3 exempts text of inactive (disabled) controls.
    if (element.closest(":disabled, [aria-disabled=true]")) continue;
    text.observations++;
    const style = getComputedStyle(element);
    const size = Number.parseFloat(style.fontSize);
    if (size < 12)
      text.small.push({
        element: describe(element),
        size,
        text: element.textContent.trim().slice(0, 40),
      });
    const bg = background(element);
    const fg = parse(style.color);
    if (!bg || !fg) {
      text.manual++;
      continue;
    }
    const value = ratio(over(fg, bg), bg);
    const bold = Number(style.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    if (value < (large ? 3 : 4.5) - 0.005)
      text.contrastFailures.push({
        element: describe(element),
        ratio: Math.round(value * 100) / 100,
        color: style.color,
        background: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})`,
        size,
        text: element.textContent.trim().slice(0, 40),
      });
  }

  const interactive = [
    ...document.body.querySelectorAll(
      'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=radio], [role=switch], [role=menuitem], [role=option], [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => {
    if (!visible(element) || transparent(element)) return false;
    // Native inputs styled as hidden behind their label measure via the label.
    return true;
  });
  const targets = [];
  for (const element of interactive) {
    if (!phone) break;
    // WCAG 2.5.8 exempts links inside a sentence of running text.
    const style = getComputedStyle(element);
    const parent = element.parentElement;
    if (
      element.tagName === "A" &&
      style.display === "inline" &&
      parent &&
      [...parent.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
      )
    )
      continue;
    let { width, height } = element.getBoundingClientRect();
    // A stretched ::before/::after (position: absolute; inset: 0) makes its
    // positioned ancestor, e.g. a whole card or row, the effective target.
    for (const pseudo of ["::before", "::after"]) {
      const after = getComputedStyle(element, pseudo);
      if (
        after.content !== "none" &&
        after.position === "absolute" &&
        ["top", "right", "bottom", "left"].every(
          (side) => after[side] === "0px",
        )
      ) {
        let holder = element.parentElement;
        while (holder && getComputedStyle(holder).position === "static")
          holder = holder.parentElement;
        if (holder) {
          const rect = holder.getBoundingClientRect();
          width = Math.max(width, rect.width);
          height = Math.max(height, rect.height);
        }
      }
    }
    for (const label of element.labels ?? []) {
      const rect = label.getBoundingClientRect();
      width = Math.max(width, rect.width);
      height = Math.max(height, rect.height);
    }
    if (width < 43.5 || height < 43.5)
      targets.push({
        element: describe(element),
        width: Math.round(width),
        height: Math.round(height),
      });
  }
  return { text, interactive: interactive.length, targets };
}

// Runs in the page after each Tab: identity and ring of the focused node.
function focusStop() {
  window.__auditIds ??= new WeakMap();
  window.__auditNext ??= 1;
  const element = document.activeElement;
  if (
    !element ||
    element === document.body ||
    element === document.documentElement
  )
    return { id: 0 };
  if (!window.__auditIds.has(element))
    window.__auditIds.set(element, window.__auditNext++);
  const drawn = (style) =>
    (style.outlineStyle !== "none" &&
      Number.parseFloat(style.outlineWidth) > 0) ||
    (style.boxShadow !== "none" && style.boxShadow !== "");
  // A stretched link may draw its ring on its ::after box instead.
  const ring = (node) =>
    drawn(getComputedStyle(node)) ||
    (node === element &&
      ["::before", "::after"].some((pseudo) => {
        const style = getComputedStyle(node, pseudo);
        return style.content !== "none" && drawn(style);
      }));
  // Composite controls draw the ring on their wrapper via :focus-within.
  let ringed = false;
  for (
    let node = element, depth = 0;
    node && depth < 3;
    node = node.parentElement, depth++
  )
    if (ring(node)) ringed = true;
  const rect = element.getBoundingClientRect();
  let name = element.tagName.toLowerCase();
  if (element.dataset?.testid)
    name += `[data-testid=${element.dataset.testid}]`;
  else if (element.classList.length)
    name += `.${[...element.classList].slice(0, 2).join(".")}`;
  return {
    id: window.__auditIds.get(element),
    ringed,
    hidden: rect.width < 1 || rect.height < 1,
    element: name,
    label: (element.getAttribute("aria-label") ?? element.textContent ?? "")
      .trim()
      .slice(0, 40),
  };
}

const NAMED_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "tab",
  "switch",
  "slider",
  "spinbutton",
  "image",
  "img",
  "dialog",
  "alertdialog",
  "tabpanel",
]);

async function audit(page, context) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const missingNames = [];
  for (const node of nodes) {
    if (node.ignored) continue;
    const role = node.role?.value;
    if (!NAMED_ROLES.has(role)) continue;
    if ((node.name?.value ?? "").trim()) continue;
    let element = "";
    if (node.backendDOMNodeId) {
      try {
        const { object } = await cdp.send("DOM.resolveNode", {
          backendNodeId: node.backendDOMNodeId,
        });
        const { result } = await cdp.send("Runtime.callFunctionOn", {
          objectId: object.objectId,
          functionDeclaration:
            "function(){return this.outerHTML ? this.outerHTML.slice(0,160) : this.nodeName}",
          returnByValue: true,
        });
        element = result.value;
      } catch {
        element = "(detached)";
      }
    }
    missingNames.push({ role, element });
  }
  await cdp.detach();
  const measured = await page.evaluate(measure, {
    phone: context.device === "phone",
  });
  const lang = await page.locator("html").getAttribute("lang");
  // Full keyboard cycle from the document start, never programmatic focus.
  // Dialog states keep their open focus; page states start at the document.
  if (!context.dialog)
    await page.evaluate(() => {
      document.activeElement?.blur?.();
      window.getSelection()?.removeAllRanges();
    });
  const stops = [];
  let first = 0;
  let complete = false;
  for (let step = 0; step < MAX_STOPS; step++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(focusStop);
    if (stop.id === 0) {
      if (stops.length) {
        complete = true;
        break;
      }
      continue;
    }
    if (stop.id === first) {
      complete = true;
      break;
    }
    if (!first) first = stop.id;
    stops.push(stop);
  }
  return {
    ...context,
    lang,
    focusStops: stops.length,
    tabCycleComplete: complete,
    missingFocusRings: stops.filter((stop) => !stop.ringed && !stop.hidden),
    hiddenFocusStops: stops.filter((stop) => stop.hidden),
    missingNames,
    interactive: measured.interactive,
    textObservations: measured.text.observations,
    manualBackgrounds: measured.text.manual,
    contrastFailures: measured.text.contrastFailures,
    smallText: measured.text.small,
    smallTargets: measured.targets,
  };
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
const results = [];
const errors = [];
try {
  for (const [device, viewport] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 800 }],
  ]) {
    for (const locale of locales) {
      for (const theme of ["light", "dark"]) {
        const options = {
          viewport,
          deviceScaleFactor: 1,
          locale: locale === "en" ? "en-US" : locale,
          timezoneId: "UTC",
          isMobile: device === "phone",
          hasTouch: device === "phone",
          colorScheme: theme,
        };
        const signedIn = await browser.newContext(options);
        const page = await signedIn.newPage();
        await page.clock.setFixedTime(new Date("2026-10-08T11:20:00Z"));
        await page.addInitScript(prepareTime);
        const login = await page.request.post(
          `${base}/api/auth/sign-in/email`,
          {
            data: { email, password },
            headers: { Origin: base },
          },
        );
        assert.equal(login.status(), 200, "Demo sign-in failed");
        const me = await (await page.request.get(`${base}/api/me`)).json();
        const workspaceId = prototypeId("workspace", "nw");
        assert(me.workspaces.some((item) => item.id === workspaceId));
        assert.equal(
          (
            await page.request.patch(`${base}/api/profile`, {
              data: { locale, tz: "UTC" },
              headers: { Origin: base },
            })
          ).status(),
          200,
        );
        const list = async (kind) => {
          const response = await page.request.get(
            `${base}/api/${kind}?workspaceId=${workspaceId}`,
          );
          assert.equal(response.status(), 200, `${kind} read failed`);
          const body = await response.json();
          return Array.isArray(body) ? body : body.items;
        };
        const ids = {
          company: (await list("companies"))[0]?.id,
          contact: (await list("contacts"))[0]?.id,
          digest: nw("digest", 1),
        };
        assert(ids.company && ids.contact, "Seed must include CRM rows");
        const prefs = ({ userId, workspaceId, locale, theme }) => {
          if (userId) {
            sessionStorage.setItem(`taff:workspace:${userId}`, workspaceId);
            localStorage.setItem("taff:last-workspace", workspaceId);
          }
          localStorage.setItem("taff-locale", locale);
          localStorage.setItem("taff-theme", theme);
        };
        await page.addInitScript(prefs, {
          userId: me.user.id,
          workspaceId,
          locale,
          theme,
        });
        for (const state of routes(ids)) {
          if (state.phone && device !== "phone") continue;
          if (state.desktop && device !== "desktop") continue;
          if (only && !only.includes(state.view)) continue;
          const context = {
            view: state.view,
            route: state.route,
            device,
            locale,
            theme,
          };
          let target = page;
          let anonymous;
          try {
            if (state.signedOut) {
              anonymous = await browser.newContext(options);
              target = await anonymous.newPage();
              await target.addInitScript(prefs, { locale, theme });
              await anonymous.addCookies([
                { name: "taff-locale", value: locale, url: base },
              ]);
            }
            const response = await target.goto(`${base}${state.route}`, {
              waitUntil: "networkidle",
            });
            assert.equal(response.status(), 200, `${state.view} did not load`);
            if (!state.signedOut)
              await expect(target.locator("main.content")).toBeVisible();
            await state.act?.(target);
            await target.waitForLoadState("networkidle");
            await target.mouse.move(0, 0);
            const result = await audit(target, {
              ...context,
              dialog: Boolean(state.act && state.view !== "task-sheet"),
            });
            results.push(result);
            const issues =
              result.contrastFailures.length +
              result.smallText.length +
              result.smallTargets.length +
              result.missingNames.length +
              result.missingFocusRings.length +
              (result.tabCycleComplete ? 0 : 1);
            console.log(
              `${device} ${locale} ${theme} ${state.view}: ${result.focusStops} stops, ${issues} issues`,
            );
          } catch (error) {
            errors.push({ ...context, error: String(error).slice(0, 400) });
            console.log(
              `${device} ${locale} ${theme} ${state.view}: ERROR ${error}`,
            );
          } finally {
            await anonymous?.close();
          }
        }
        await signedIn.close();
      }
    }
  }
} finally {
  await browser.close();
}
const sum = (key) =>
  results.reduce(
    (total, row) =>
      total + (Array.isArray(row[key]) ? row[key].length : row[key]),
    0,
  );
const summary = {
  measuredContexts: results.length,
  renderErrors: errors.length,
  localeCount: locales.length,
  themes: ["light", "dark"],
  viewports: { phone: [390, 844], desktop: [1280, 800] },
  routeStates: [...new Set(results.map((row) => `${row.device}:${row.view}`))]
    .length,
  contrastFailures: sum("contrastFailures"),
  smallEffectivePhoneTargets: sum("smallTargets"),
  below12pxText: sum("smallText"),
  missingNames: sum("missingNames"),
  missingFocusRings: sum("missingFocusRings"),
  incompleteTabCycles: results.filter((row) => !row.tabCycleComplete).length,
  hiddenFocusStops: sum("hiddenFocusStops"),
  langMismatches: results.filter(
    (row) =>
      !row.lang?.startsWith(
        row.locale === "en" ? "en" : row.locale.slice(0, 2),
      ),
  ).length,
  focusStops: sum("focusStops"),
  interactiveObservations: sum("interactive"),
  textObservations: sum("textObservations"),
  manualBackgroundObservations: sum("manualBackgrounds"),
};
await writeFile(
  path.join(out, "summary.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
await writeFile(
  path.join(out, "details.json"),
  `${JSON.stringify({ results, errors }, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));

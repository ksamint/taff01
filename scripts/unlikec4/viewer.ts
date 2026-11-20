// unlikec4 viewer: one ontology, redrawn per perspective. Runs in the browser;
// `build.ts` bundles it with the document. Knows nothing about the repository.
import type { Flow, Module, Ontology, Thing } from "./schema.ts";

const doc = JSON.parse(
  document.getElementById("unlikec4")?.textContent ?? "{}",
) as Ontology;
const app = document.getElementById("app") as HTMLElement;
const built = doc.perspectives.filter((p) => p.built);
const state: {
  tab: string;
  thing: string | null;
  module: string | null;
  flow: string | null;
  query: string;
} = {
  tab: built[0]?.id ?? "things",
  thing: null,
  module: null,
  flow: null,
  query: "",
};

const esc = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
const things = new Map(doc.things.map((t) => [t.id, t]));
const modules = new Map(doc.modules.map((m) => [m.id, m]));
const tname = (id: string) => things.get(id)?.title ?? id;
const mname = (id: string) => modules.get(id)?.title ?? id;
const label = (action: string) => action.replace(":", " · ").replace(/_/g, " ");
const flow = (): Flow | null =>
  doc.flows.find((f) => f.id === state.flow) ?? null;
const hit = (texts: string[]) => {
  const q = state.query.trim().toLowerCase();
  return !q || texts.some((text) => text.toLowerCase().includes(q));
};
const thingHit = (t: Thing) => hit([t.title, t.summary, t.kind, ...t.stored]);
const moduleHit = (m: Module) =>
  hit([
    m.title,
    m.summary,
    ...m.functions.map((f) => f.action),
    ...m.specs.flatMap((s) => [
      s.title,
      ...s.groups.map((g) => `${g.id} ${g.title}`),
    ]),
    ...Object.values(m.details).flat(),
  ]);
const kindNote: Record<string, string> = {
  kind: "exists on its own",
  role: "what one thing is to another",
  relator: "a relation with its own record",
  event: "something that happened",
  attribute: "a quality of another thing",
  rule: "decides what may happen",
  output: "produced from other things",
  view: "recomputed on read",
};
const pick = (kind: "thing" | "module", id: string, text: string, extra = "") =>
  `<button type="button" class="chip" data-${kind}="${id}">${esc(text)}${extra}</button>`;

// ---------- Things: ranked by tier, then by dependents ----------
function thingsView(): string {
  const max = Math.max(1, ...doc.things.map((t) => t.dependents ?? 0));
  return doc.tiers
    .map((tier) => {
      const items = doc.things
        .filter((t) => t.tier === tier.id)
        .sort((a, b) => (b.dependents ?? 0) - (a.dependents ?? 0));
      return `<section class="tier"><header><b>${tier.id}</b><h3>${esc(tier.title)}</h3><p>${esc(tier.summary)}</p></header><div class="things">${items
        .map(
          (t) =>
            `<button type="button" class="thing${state.thing === t.id ? " on" : ""}${t.missing ? " missing" : ""}${thingHit(t) ? "" : " dim"}" data-thing="${t.id}"><span class="thing-title">${esc(t.title)}</span><span class="tag">${t.missing ? "not modelled" : esc(t.kind)}</span>${t.dependents ? `<span class="dep" title="${t.dependents} tables cannot exist without it"><i style="width:${Math.max(8, Math.round((t.dependents / max) * 100))}%"></i></span><span class="dep-n">${t.dependents}</span>` : ""}</button>`,
        )
        .join("")}</div></section>`;
    })
    .join("");
}

// ---------- Structure: what contains what, and who holds a role there ----------
function branch(parent: string | undefined): string {
  const kids = doc.things.filter(
    (t) =>
      t.partOf === parent &&
      t.kind !== "view" &&
      (parent || t.id === doc.things[0]?.id),
  );
  if (!kids.length) return "";
  return `<ul>${kids
    .map((t) => {
      const roles = doc.rolesAt.filter((r) => r.at === t.id);
      return `<li><button type="button" class="node${state.thing === t.id ? " on" : ""}${t.missing ? " missing" : ""}${thingHit(t) ? "" : " dim"}" data-thing="${t.id}"><span class="thing-title">${esc(t.title)}</span><span class="tag">${t.missing ? "not modelled" : esc(t.kind)}</span>${roles.map((r) => `<span class="role" title="${esc(r.summary)}">${esc(r.title)}</span>`).join("")}</button>${branch(t.id)}</li>`;
    })
    .join("")}</ul>`;
}

// ---------- Authority: role by function ----------
function authorityView(): string {
  const rows = doc.groups
    .flatMap((group) => group.modules)
    .map((id) => modules.get(id))
    .filter((m): m is Module => !!m && m.functions.length > 0)
    .map((m) => {
      const fns = m.functions.filter((f) => hit([f.action, m.title]));
      if (!fns.length) return "";
      return `<tr class="mrow"><th colspan="${doc.roles.length + 1}"><button type="button" class="link" data-module="${m.id}">${esc(m.title)}</button></th></tr>${fns
        .map(
          (f) =>
            `<tr><td>${esc(label(f.action))}</td>${doc.roles.map((r) => `<td class="${f.roles[r.id] ? "yes" : "no"}">${f.roles[r.id] ? "●" : "–"}</td>`).join("")}</tr>`,
        )
        .join("")}`;
    })
    .join("");
  return `<div class="scroll"><table class="fn wide"><thead><tr><th>Function</th>${doc.roles.map((r) => `<th>${esc(r.title)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Baseline from the permission function: a person who is not the task's owner, and an agent working its own task. The roles below add to it.</p>
    <dl class="roles">${doc.rolesAt.map((r) => `<div><dt>${esc(r.title)} <span>at ${esc(tname(r.at))}, held by a ${esc(tname(r.heldBy).toLowerCase())}</span></dt><dd>${esc(r.summary)}</dd></div>`).join("")}</dl>`;
}

// ---------- Dependency and Flow: the module board ----------
function card(m: Module): string {
  const active = state.tab === "flow" ? flow() : null;
  const steps = active
    ? active.steps.flatMap((step, index) =>
        step.module === m.id ? [index + 1] : [],
      )
    : [];
  const sel = state.module ? modules.get(state.module) : undefined;
  const related =
    sel &&
    (sel.id === m.id ||
      sel.uses.some((u) => u.id === m.id) ||
      sel.usedBy.some((u) => u.id === m.id));
  const dim =
    !moduleHit(m) || (active ? steps.length === 0 : sel ? !related : false);
  const reqs = m.specs.reduce((sum, spec) => sum + spec.groups.length, 0);
  return `<button type="button" class="card${state.module === m.id ? " on" : ""}${dim ? " dim" : ""}" data-module="${m.id}" id="card-${m.id}">
    ${steps.length ? `<span class="steps">${steps.map((n) => `<b>${n}</b>`).join("")}</span>` : ""}
    <span class="card-title">${esc(m.title)}</span><span class="card-text">${esc(m.summary)}</span>
    <span class="card-meta"><span>${m.functions.length ? `${m.functions.length} function${m.functions.length === 1 ? "" : "s"}` : "read only"}</span><span class="${reqs ? "" : "warn"}">${reqs ? `${reqs} requirement group${reqs === 1 ? "" : "s"}` : "no spec"}</span></span>
  </button>`;
}
function boardView(): string {
  const active = state.tab === "flow" ? flow() : null;
  const head =
    state.tab === "flow"
      ? `<label class="pick">Flow<select id="flow-pick">${doc.flows.map((f) => `<option value="${f.id}"${state.flow === f.id ? " selected" : ""}>${esc(f.title)}</option>`).join("")}</select></label>${
          active
            ? `<ol class="flow">${active.steps.map((step) => `<li><button type="button" data-module="${step.module}"><strong>${esc(step.title)}</strong><em>${esc(mname(step.module))}</em><span>${esc(step.text)}</span></button></li>`).join("")}</ol>`
            : ""
        }`
      : "";
  return `${head}<div class="board" id="board"><svg id="wires" aria-hidden="true"></svg>${doc.groups
    .map(
      (group) =>
        `<section class="lane"><h3>${esc(group.title)}</h3><div class="cards">${group.modules
          .map((id) => modules.get(id))
          .filter((m): m is Module => !!m)
          .map(card)
          .join("")}</div></section>`,
    )
    .join(
      "",
    )}<p class="legend"><span><i class="k-uses"></i>uses data of</span><span><i class="k-usedby"></i>is used by</span><span><i class="k-flow"></i>flow step</span></p></div>`;
}

// ---------- The reading panel ----------
const list = (title: string, items: string[]) =>
  items.length
    ? `<h5>${esc(title)} <span>${items.length}</span></h5><ul class="mono">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
    : "";
function thingPanel(t: Thing): string {
  const tier = doc.tiers.find((x) => x.id === t.tier);
  const kids = doc.things.filter((x) => x.partOf === t.id);
  const roles = doc.rolesAt.filter((r) => r.at === t.id);
  return `<button type="button" class="back" data-clear="1">← ${esc(built.find((p) => p.id === state.tab)?.title ?? "Back")}</button>
    <h2>${esc(t.title)}</h2><p class="lead">${esc(t.summary)}</p>
    <dl class="facts"><div><dt>Tier</dt><dd>${t.tier} · ${esc(tier?.title ?? "")}</dd></div><div><dt>Kind</dt><dd>${t.missing ? "not modelled" : `${esc(t.kind)}: ${esc(kindNote[t.kind] ?? "")}`}</dd></div><div><dt>Stored in</dt><dd>${t.stored.length ? t.stored.map((s) => `<code>${esc(s)}</code>`).join(" ") : "nothing"}</dd></div></dl>
    <h4>Structure</h4>
    <p class="rel"><span>Part of</span>${t.partOf ? pick("thing", t.partOf, tname(t.partOf)) : '<span class="none">nothing: top level</span>'}</p>
    <p class="rel"><span>Contains</span>${kids.length ? kids.map((k) => pick("thing", k.id, k.title)).join("") : '<span class="none">nothing</span>'}</p>
    ${roles.length ? `<h4>Roles held here</h4><dl class="roles">${roles.map((r) => `<div><dt>${esc(r.title)} <span>held by a ${esc(tname(r.heldBy).toLowerCase())}</span></dt><dd>${esc(r.summary)}</dd></div>`).join("")}</dl>` : ""}
    <h4>Importance</h4>
    <p class="note">${t.dependents ? `${t.dependents} table${t.dependents === 1 ? "" : "s"} cannot exist without it.` : "Nothing else needs it to exist."}</p>
    ${t.referredBy?.length ? `<p class="rel"><span>Needed by</span>${t.referredBy.map((id) => pick("thing", id, tname(id))).join("")}</p>` : ""}
    <h4>Mapping</h4>
    <p class="rel"><span>Owned by module</span>${t.modules?.length ? t.modules.map((id) => pick("module", id, mname(id))).join("") : '<span class="none">none: not stored</span>'}</p>`;
}
function modulePanel(m: Module): string {
  const flows = doc.flows.filter((f) => f.steps.some((s) => s.module === m.id));
  const owned = doc.things.filter((t) => t.modules?.includes(m.id));
  const chips = (items: { id: string; count: number }[]) =>
    items.length
      ? items
          .map((item) =>
            pick(
              "module",
              item.id,
              mname(item.id),
              `<span>${item.count}</span>`,
            ),
          )
          .join("")
      : '<span class="none">none</span>';
  return `<button type="button" class="back" data-clear="1">← ${esc(built.find((p) => p.id === state.tab)?.title ?? "Back")}</button>
    <h2>${esc(m.title)}</h2><p class="lead">${esc(m.summary)}</p>
    <h4>Things it holds</h4><p class="rel">${owned.length ? owned.map((t) => pick("thing", t.id, t.title)).join("") : '<span class="none">none: it stores nothing</span>'}</p>
    <h4>Functions and who may use them</h4>
    ${
      m.functions.length
        ? `<table class="fn"><thead><tr><th>Function</th>${doc.roles.map((r) => `<th>${esc(r.title)}</th>`).join("")}</tr></thead><tbody>${m.functions.map((f) => `<tr><td>${esc(label(f.action))}</td>${doc.roles.map((r) => `<td class="${f.roles[r.id] ? "yes" : "no"}">${f.roles[r.id] ? "●" : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table>`
        : '<p class="note">No permission action of its own. Anyone who can read the organization can read it.</p>'
    }
    <h4>Requirements</h4>
    ${
      m.specs.length
        ? m.specs
            .map(
              (spec) =>
                `<div class="spec"><strong>${esc(spec.title)}</strong><code>${esc(spec.file)}</code>${spec.groups.length ? `<ul>${spec.groups.map((g) => `<li><b>${esc(g.id)}</b>${esc(g.title)}<span>${g.count}</span></li>`).join("")}</ul>` : ""}</div>`,
            )
            .join("")
        : '<p class="note warn">No living specification for this module.</p>'
    }
    <h4>Flows it takes part in</h4>
    ${
      flows.length
        ? `<ul class="flows">${flows
            .map(
              (f) =>
                `<li><button type="button" class="link" data-flow="${f.id}">${esc(f.title)}</button><span>${f.steps
                  .flatMap((s, i) =>
                    s.module === m.id ? [`${i + 1}. ${s.title}`] : [],
                  )
                  .map(esc)
                  .join(" · ")}</span></li>`,
            )
            .join("")}</ul>`
        : '<p class="note">None of the mapped flows.</p>'
    }
    <h4>Relations</h4>
    <p class="rel"><span>Uses data of</span>${chips(m.uses)}</p><p class="rel"><span>Its data is used by</span>${chips(m.usedBy)}</p>
    <details><summary>Details</summary>${Object.entries(m.details)
      .map(([key, items]) => list(key, items))
      .join("")}</details>`;
}
function perspectivePanel(): string {
  const p = doc.perspectives.find((x) => x.id === state.tab);
  const planned = doc.perspectives.filter((x) => !x.built);
  return `<h2>${esc(p?.question ?? "")}</h2>
    <dl class="facts"><div><dt>Perspective</dt><dd>${esc(p?.title ?? "")}</dd></div><div><dt>Relation it follows</dt><dd>${esc(p?.relation ?? "")}</dd></div><div><dt>Form</dt><dd>${esc(p?.form ?? "")}</dd></div></dl>
    <p class="note">Click anything on the left to read it here. The same ${doc.things.length} things and ${doc.modules.length} modules appear in every perspective; only the relation that is drawn changes.</p>
    <h4>All perspectives</h4>
    <ul class="specs">${doc.perspectives.map((x) => `<li><strong>${esc(x.title)}${x.built ? "" : ' <span class="warn">planned</span>'}</strong><span>${esc(x.question)} ${esc(x.form)}.</span></li>`).join("")}</ul>
    ${planned.length ? "" : ""}
    ${doc.crossSpecs.length ? `<h4>Requirements that cut across modules</h4><ul class="specs">${doc.crossSpecs.map((spec) => `<li><strong>${esc(spec.title)}</strong><span>${spec.groups.length} requirement groups · ${esc(spec.file)}</span></li>`).join("")}</ul>` : ""}`;
}

// ---------- Wires on the board ----------
function draw() {
  const svg = document.getElementById("wires");
  const host = document.getElementById("board");
  if (!svg || !host) return;
  const origin = host.getBoundingClientRect();
  svg.setAttribute("width", String(origin.width));
  svg.setAttribute("height", String(origin.height));
  const box = (id: string) => {
    const r = document.getElementById(`card-${id}`)?.getBoundingClientRect();
    return r
      ? {
          x: r.left - origin.left,
          y: r.top - origin.top,
          w: r.width,
          h: r.height,
        }
      : null;
  };
  const leave = (
    b: { x: number; y: number; w: number; h: number },
    tx: number,
    ty: number,
  ) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const k = Math.min(
      dx === 0 ? Number.POSITIVE_INFINITY : b.w / 2 / Math.abs(dx),
      dy === 0 ? Number.POSITIVE_INFINITY : b.h / 2 / Math.abs(dy),
    );
    return { x: cx + dx * k, y: cy + dy * k };
  };
  const lines: string[] = [];
  const wire = (from: string, to: string, kind: string, text = "") => {
    const a = box(from);
    const b = box(to);
    if (!a || !b || from === to) return;
    const p = leave(a, b.x + b.w / 2, b.y + b.h / 2);
    const q = leave(b, a.x + a.w / 2, a.y + a.h / 2);
    const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const bend = kind === "flowline" ? 30 : 12;
    const cx = (p.x + q.x) / 2 + (-(q.y - p.y) / length) * bend;
    const cy = (p.y + q.y) / 2 + ((q.x - p.x) / length) * bend;
    lines.push(
      `<path class="wire ${kind}" d="M${p.x} ${p.y}Q${cx} ${cy} ${q.x} ${q.y}" marker-end="url(#arrow-${kind})"/>`,
    );
    if (text)
      lines.push(
        `<text x="${0.25 * p.x + 0.5 * cx + 0.25 * q.x}" y="${0.25 * p.y + 0.5 * cy + 0.25 * q.y + 4}" text-anchor="middle">${text}</text>`,
      );
  };
  if (window.innerWidth >= 760) {
    const active = state.tab === "flow" ? flow() : null;
    if (active)
      active.steps.forEach((step, index) => {
        const next = active.steps[index + 1];
        if (next)
          wire(
            step.module,
            next.module,
            "flowline",
            `${index + 1} → ${index + 2}`,
          );
      });
    else if (state.module) {
      const m = modules.get(state.module);
      for (const target of m?.uses ?? []) wire(state.module, target.id, "uses");
      for (const source of m?.usedBy ?? [])
        wire(source.id, state.module, "usedby");
    }
  }
  svg.innerHTML = `<defs>${["flowline", "uses", "usedby"].map((kind) => `<marker id="arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="head ${kind}" d="M0 0L10 5L0 10z"/></marker>`).join("")}</defs>${lines.join("")}`;
}

function render(keepFocus = false) {
  if (state.tab === "flow" && !state.flow)
    state.flow = doc.flows[0]?.id ?? null;
  const p = doc.perspectives.find((x) => x.id === state.tab);
  const view =
    state.tab === "things"
      ? thingsView()
      : state.tab === "structure"
        ? `<div class="tree">${branch(undefined)}</div>`
        : state.tab === "authority"
          ? authorityView()
          : boardView();
  const t = state.thing ? things.get(state.thing) : undefined;
  const m = state.module ? modules.get(state.module) : undefined;
  app.innerHTML = `<header class="top"><p class="eyebrow">${esc(doc.name)} · unlikec4</p><h1>${esc(p?.question ?? doc.name)}</h1>
    <div class="controls"><div class="seg" role="tablist" aria-label="Perspective">${built.map((x) => `<button type="button" role="tab" data-tab="${x.id}" aria-selected="${state.tab === x.id}" aria-pressed="${state.tab === x.id}">${esc(x.title)}</button>`).join("")}</div>
    <input id="query" type="search" placeholder="Find a thing, function, table, route…" aria-label="Find" value="${esc(state.query)}"></div>
    <p class="planned">Planned perspectives: ${doc.perspectives
      .filter((x) => !x.built)
      .map((x) => esc(x.title))
      .join(", ")}.</p></header>
    <div class="main"><div class="stage">${view}</div><aside class="panel" id="panel">${t ? thingPanel(t) : m ? modulePanel(m) : perspectivePanel()}</aside></div>`;
  draw();
  if (keepFocus) {
    const input = document.getElementById("query") as HTMLInputElement | null;
    input?.focus();
    input?.setSelectionRange(state.query.length, state.query.length);
  }
}
function go(tab: string) {
  if (!built.some((x) => x.id === tab)) return;
  state.tab = tab;
  try {
    history.replaceState(null, "", `#${tab}`);
  } catch {}
}

app.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-tab],[data-thing],[data-module],[data-flow],[data-clear]",
  );
  if (!target) return;
  const d = target.dataset;
  if (d.tab) {
    go(d.tab);
    state.thing = null;
    state.module = null;
  } else if (d.clear) {
    state.thing = null;
    state.module = null;
  } else if (d.thing) {
    state.thing =
      state.thing === d.thing && !target.classList.contains("chip")
        ? null
        : d.thing;
    state.module = null;
    if (state.tab !== "things" && state.tab !== "structure") go("things");
  } else if (d.module) {
    state.module =
      state.module === d.module && target.classList.contains("card")
        ? null
        : d.module;
    state.thing = null;
    if (state.tab === "things" || state.tab === "structure") go("dependency");
  } else if (d.flow) {
    state.flow = d.flow;
    go("flow");
  }
  render();
  if (
    (state.thing || state.module) &&
    window.innerWidth < 980 &&
    (d.thing || d.module)
  )
    document
      .getElementById("panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
});
app.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement;
  if (target.id !== "flow-pick") return;
  state.flow = target.value;
  render();
});
app.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id !== "query") return;
  state.query = target.value;
  render(true);
});
window.addEventListener("resize", draw);
window.addEventListener("hashchange", () => {
  const tab = location.hash.slice(1);
  if (tab && tab !== state.tab && built.some((x) => x.id === tab)) {
    state.tab = tab;
    render();
  }
});
if (built.some((x) => x.id === location.hash.slice(1)))
  state.tab = location.hash.slice(1);
render();

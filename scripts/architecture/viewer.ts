// The function map: a focused, clickable view of the architecture model.
// Runs in the browser; `build-map.mts` bundles it with the model data.
import type { FocusModel, MapModule, RoleId } from "./focus-model.ts";

const model = JSON.parse(
  document.getElementById("taff-map")?.textContent ?? "{}",
) as FocusModel;
const app = document.getElementById("app") as HTMLElement;
const roleIds: RoleId[] = ["admin", "member", "guest", "agent"];
const state: {
  module: string | null;
  role: RoleId | null;
  flow: string | null;
  query: string;
} = { module: null, role: null, flow: null, query: "" };

const esc = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
const byId = new Map(model.modules.map((m) => [m.id, m]));
const name = (id: string) => byId.get(id)?.title ?? id;
const label = (action: string) => action.replace(":", " · ").replace(/_/g, " ");
const flow = () => model.flows.find((f) => f.id === state.flow) ?? null;
const requirementCount = (m: MapModule) =>
  m.specs.reduce((sum, spec) => sum + spec.groups.length, 0);
const matches = (m: MapModule) => {
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return [
    m.title,
    m.summary,
    ...m.functions.map((f) => f.action),
    ...m.specs.flatMap((s) => [
      s.title,
      ...s.groups.map((g) => `${g.id} ${g.title}`),
    ]),
    ...Object.values(m.details).flat(),
  ].some((text) => text.toLowerCase().includes(q));
};

function card(m: MapModule): string {
  const active = flow();
  const steps = active
    ? active.steps.flatMap((step, index) =>
        step.module === m.id ? [index + 1] : [],
      )
    : [];
  const related =
    state.module &&
    (state.module === m.id ||
      byId.get(state.module)?.uses.some((u) => u.id === m.id) ||
      byId.get(state.module)?.usedBy.some((u) => u.id === m.id));
  const dim =
    !matches(m) ||
    (active ? steps.length === 0 : state.module ? !related : false) ||
    (state.role !== null &&
      !active &&
      !state.module &&
      m.functions.length > 0 &&
      !m.functions.some((f) => f.roles[state.role as RoleId]));
  const allowed = state.role
    ? m.functions.filter((f) => f.roles[state.role as RoleId]).length
    : 0;
  const reqs = requirementCount(m);
  return `<button type="button" class="card${state.module === m.id ? " on" : ""}${dim ? " dim" : ""}" data-module="${m.id}" id="card-${m.id}" aria-pressed="${state.module === m.id}">
    ${steps.length ? `<span class="steps">${steps.map((n) => `<b>${n}</b>`).join("")}</span>` : ""}
    <span class="card-title">${esc(m.title)}</span>
    <span class="card-text">${esc(m.summary)}</span>
    <span class="card-meta">
      <span>${m.functions.length ? `${m.functions.length} function${m.functions.length === 1 ? "" : "s"}` : "read only"}</span>
      <span class="${reqs ? "" : "warn"}">${reqs ? `${reqs} requirement group${reqs === 1 ? "" : "s"}` : "no spec"}</span>
    </span>
    ${state.role && m.functions.length ? `<span class="bar" title="${allowed} of ${m.functions.length}"><i style="width:${Math.round((allowed / m.functions.length) * 100)}%"></i></span><span class="bar-text">${esc(state.role)}: ${allowed} of ${m.functions.length}</span>` : ""}
  </button>`;
}

function board(): string {
  return model.groups
    .map(
      (group) =>
        `<section class="lane"><h3>${esc(group.title)}</h3><div class="cards">${group.modules
          .map((id) => byId.get(id))
          .filter((m): m is MapModule => !!m)
          .map(card)
          .join("")}</div></section>`,
    )
    .join("");
}

function flowStrip(): string {
  const active = flow();
  if (!active) return "";
  return `<ol class="flow">${active.steps
    .map(
      (step) =>
        `<li><button type="button" data-module="${step.module}"><strong>${esc(step.title)}</strong><em>${esc(name(step.module))}</em><span>${esc(step.text)}</span></button></li>`,
    )
    .join("")}</ol>`;
}

const list = (title: string, items: string[]) =>
  items.length
    ? `<h5>${esc(title)} <span>${items.length}</span></h5><ul class="mono">${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
    : "";
const chips = (items: { id: string; count: number }[]) =>
  items.length
    ? items
        .map(
          (item) =>
            `<button type="button" class="chip" data-module="${item.id}">${esc(name(item.id))}<span>${item.count}</span></button>`,
        )
        .join("")
    : '<span class="none">none</span>';

function overview(): string {
  return `<h2>How Taff is organized</h2>
    <p class="lead">Pick a module on the left to see what it does, who may do it, what it must satisfy and what it depends on. Use the role and flow controls to light up the map.</p>
    <h4>Levels</h4>
    <ol class="levels">${model.levels
      .map(
        (level) =>
          `<li class="${level.missing ? "missing" : ""}"><strong>${esc(level.title)}</strong>${level.table ? `<code>${esc(level.table)}</code>` : '<span class="warn">not modelled</span>'}<span>${esc(level.note)}</span></li>`,
      )
      .join("")}</ol>
    <h4>Roles in an organization</h4>
    <dl class="roles">${model.roles.map((role) => `<div><dt>${esc(role.title)}</dt><dd>${esc(role.summary)}</dd></div>`).join("")}</dl>
    <h4>Roles from a relationship</h4>
    <dl class="roles">${model.relationshipRoles.map((role) => `<div><dt>${esc(role.title)}</dt><dd>${esc(role.summary)}</dd></div>`).join("")}</dl>
    <h4>Requirements that cut across modules</h4>
    <ul class="specs">${model.crossSpecs.map((spec) => `<li><strong>${esc(spec.title)}</strong><code>docs/spec/${esc(spec.file)}</code><span>${spec.groups.length} requirement groups</span></li>`).join("")}</ul>`;
}

function detail(m: MapModule): string {
  const flows = model.flows.filter((f) =>
    f.steps.some((s) => s.module === m.id),
  );
  const d = m.details;
  return `<button type="button" class="back" data-clear="1">← Overview</button>
    <h2>${esc(m.title)}</h2>
    <p class="lead">${esc(m.summary)}</p>
    <h4>Functions and who may use them</h4>
    ${
      m.functions.length
        ? `<table class="fn"><thead><tr><th>Function</th>${roleIds.map((r) => `<th class="${state.role === r ? "hot" : ""}">${esc(r)}</th>`).join("")}</tr></thead><tbody>${m.functions
            .map(
              (f) =>
                `<tr><td>${esc(label(f.action))}</td>${roleIds.map((r) => `<td class="${f.roles[r] ? "yes" : "no"}${state.role === r ? " hot" : ""}">${f.roles[r] ? "●" : "–"}</td>`).join("")}</tr>`,
            )
            .join(
              "",
            )}</tbody></table><p class="note">Baseline from the permission function: a person who is not the task's owner, and an agent working its own task. Owners, workers, the person in charge and supervisors get more.</p>`
        : '<p class="note">No permission action of its own. Anyone who can read the organization can read it.</p>'
    }
    <h4>Requirements</h4>
    ${
      m.specs.length
        ? m.specs
            .map(
              (spec) =>
                `<div class="spec"><strong>${esc(spec.title)}</strong><code>docs/spec/${esc(spec.file)}</code>${spec.groups.length ? `<ul>${spec.groups.map((g) => `<li><b>${esc(g.id)}</b>${esc(g.title)}<span>${g.count}</span></li>`).join("")}</ul>` : ""}</div>`,
            )
            .join("")
        : '<p class="note warn">No living specification in docs/spec for this module.</p>'
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
        : '<p class="note">None of the five mapped flows.</p>'
    }
    <h4>Relations</h4>
    <p class="rel"><span>Uses data of</span>${chips(m.uses)}</p>
    <p class="rel"><span>Its data is used by</span>${chips(m.usedBy)}</p>
    <details><summary>Details: tables, routes, tools and files</summary>
      ${list("Tables", d.tables)}${list("REST routes", d.routes)}${list("MCP tools", d.tools)}${list("Core files", d.core)}${list("Screens", d.screens)}${list("Other sources", d.sources)}
    </details>`;
}

function controls(): string {
  return `<div class="seg" role="group" aria-label="Role"><button type="button" data-role="" aria-pressed="${state.role === null}">All roles</button>${model.roles
    .map(
      (role) =>
        `<button type="button" data-role="${role.id}" aria-pressed="${state.role === role.id}">${esc(role.title)}</button>`,
    )
    .join("")}</div>
    <label class="pick">Flow<select id="flow-pick"><option value="">None</option>${model.flows.map((f) => `<option value="${f.id}"${state.flow === f.id ? " selected" : ""}>${esc(f.title)}</option>`).join("")}</select></label>
    <input id="query" type="search" placeholder="Find a function, table, route…" aria-label="Find" value="${esc(state.query)}">`;
}

function rect(id: string, origin: DOMRect) {
  const r = document.getElementById(`card-${id}`)?.getBoundingClientRect();
  if (!r) return null;
  return {
    x: r.left - origin.left,
    y: r.top - origin.top,
    w: r.width,
    h: r.height,
  };
}
/** Point where the line from a box's centre towards (tx, ty) leaves the box. */
function edge(
  box: { x: number; y: number; w: number; h: number },
  tx: number,
  ty: number,
) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : box.w / 2 / Math.abs(dx),
    dy === 0 ? Number.POSITIVE_INFINITY : box.h / 2 / Math.abs(dy),
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function draw() {
  const svg = document.getElementById("wires");
  const host = document.getElementById("board");
  if (!svg || !host) return;
  const origin = host.getBoundingClientRect();
  svg.setAttribute("width", String(origin.width));
  svg.setAttribute("height", String(origin.height));
  const lines: string[] = [];
  const wire = (from: string, to: string, kind: string, text = "") => {
    const a = rect(from, origin);
    const b = rect(to, origin);
    if (!a || !b || from === to) return;
    const p = edge(a, b.x + b.w / 2, b.y + b.h / 2);
    const q = edge(b, a.x + a.w / 2, a.y + a.h / 2);
    // Bend each wire to its own side, so A to B and B to A do not overlap.
    const length = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const bend = kind === "flowline" ? 30 : 12;
    const cx = (p.x + q.x) / 2 + (-(q.y - p.y) / length) * bend;
    const cy = (p.y + q.y) / 2 + ((q.x - p.x) / length) * bend;
    lines.push(
      `<path class="wire ${kind}" d="M${p.x} ${p.y}Q${cx} ${cy} ${q.x} ${q.y}" marker-end="url(#arrow-${kind})"/>`,
    );
    if (text)
      lines.push(
        `<text class="${kind}" x="${0.25 * p.x + 0.5 * cx + 0.25 * q.x}" y="${0.25 * p.y + 0.5 * cy + 0.25 * q.y + 4}" text-anchor="middle">${text}</text>`,
      );
  };
  const active = flow();
  if (window.innerWidth >= 760) {
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
      const m = byId.get(state.module);
      for (const target of m?.uses ?? []) wire(state.module, target.id, "uses");
      for (const source of m?.usedBy ?? [])
        wire(source.id, state.module, "usedby");
    }
  }
  svg.innerHTML = `<defs>${["flowline", "uses", "usedby"]
    .map(
      (kind) =>
        `<marker id="arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="head ${kind}" d="M0 0L10 5L0 10z"/></marker>`,
    )
    .join("")}</defs>${lines.join("")}`;
}

function render(keepFocus = false) {
  const m = state.module ? byId.get(state.module) : undefined;
  const total = model.modules.reduce(
    (sum, item) => sum + item.functions.length,
    0,
  );
  app.innerHTML = `<header class="top"><p class="eyebrow">Taff · function map</p><h1>What Taff does, who may do it, and how the parts connect</h1>
    <p class="lead">${model.modules.length} modules, ${total} functions, ${model.flows.length} flows. Read from the code and the specifications; tables, routes and files are folded under each module.</p>
    <div class="controls">${controls()}</div>${flowStrip()}</header>
    <div class="main"><div class="board" id="board"><svg id="wires" aria-hidden="true"></svg>${board()}
      <p class="legend"><span><i class="k-uses"></i>uses data of</span><span><i class="k-usedby"></i>is used by</span><span><i class="k-flow"></i>flow step</span></p></div>
    <aside class="panel" id="panel">${m ? detail(m) : overview()}</aside></div>`;
  draw();
  if (keepFocus) {
    const input = document.getElementById("query") as HTMLInputElement | null;
    input?.focus();
    input?.setSelectionRange(state.query.length, state.query.length);
  }
}

app.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-module],[data-role],[data-flow],[data-clear]",
  );
  if (!target) return;
  if (target.dataset.clear) state.module = null;
  else if (target.dataset.module) {
    const id = target.dataset.module;
    state.module =
      state.module === id && target.classList.contains("card") ? null : id;
  } else if (target.dataset.flow !== undefined)
    state.flow = target.dataset.flow || null;
  else if (target.dataset.role !== undefined)
    state.role = (target.dataset.role || null) as RoleId | null;
  render();
  if (state.module && window.innerWidth < 980 && target.dataset.module)
    document
      .getElementById("panel")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
});
app.addEventListener("change", (event) => {
  const target = event.target as HTMLElement;
  if (target.id !== "flow-pick") return;
  state.flow = (target as HTMLSelectElement).value || null;
  render();
});
app.addEventListener("input", (event) => {
  const target = event.target as HTMLElement;
  if (target.id !== "query") return;
  state.query = (target as HTMLInputElement).value;
  render(true);
});
window.addEventListener("resize", draw);
render();

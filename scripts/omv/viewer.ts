// OMV map: pick a centre (o) and a question (q); the page shows
// View(M; o, q, c, r) and says what produced it. Runs in the browser.
import { type Branch, type Obj, type OmvDocument, tree, view } from "./omv.ts";

const doc = JSON.parse(
  document.getElementById("omv")?.textContent ?? "{}",
) as OmvDocument;
const app = document.getElementById("app") as HTMLElement;
const objects = new Map(doc.m.objects.map((o) => [o.id, o]));
const typeOf = new Map(doc.o.objectTypes.map((t) => [t.id, t]));
const state: {
  centre: string;
  question: string;
  viewer: string;
  query: string;
  open: Set<string>;
} = {
  centre: doc.root,
  question: doc.v.questions[0]?.id ?? "",
  viewer: "",
  query: "",
  open: new Set(["product", "concept", "module", "role"]),
};

const esc = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );
const title = (id: string) => objects.get(id)?.title ?? id;
const num = (o: Obj | undefined, key: string) =>
  typeof o?.attrs?.[key] === "number" ? (o.attrs[key] as number) : 0;
const rels = (type: string, side: "from" | "to", id: string) =>
  doc.m.relations
    .filter((r) => r.type === type && r[side] === id)
    .map((r) => (side === "from" ? r.to : r.from));
const chip = (id: string, extra = "") => {
  const o = objects.get(id);
  return `<button type="button" class="chip${id === state.centre ? " on" : ""}" data-centre="${esc(id)}">${esc(o?.title ?? id)}<span class="tag">${esc(typeOf.get(o?.type ?? "")?.title ?? "")}</span>${extra}</button>`;
};
const hit = (o: Obj) => {
  const q = state.query.trim().toLowerCase();
  return (
    !q || `${o.title} ${o.summary ?? ""} ${o.id}`.toLowerCase().includes(q)
  );
};

// ---------- O: the picker, ranked ----------
function picker(): string {
  return doc.o.objectTypes
    .map((type) => {
      const all = doc.m.objects.filter((o) => o.type === type.id);
      const items = all.filter(hit);
      if (!items.length) return "";
      const open = state.open.has(type.id) || state.query.trim() !== "";
      const button = (o: Obj) =>
        `<button type="button" class="pick-item${o.id === state.centre ? " on" : ""}${o.attrs?.missing ? " missing" : ""}" data-centre="${esc(o.id)}"><span>${esc(o.title)}</span>${num(o, "dependents") ? `<b title="tables that cannot exist without it">${num(o, "dependents")}</b>` : ""}</button>`;
      let body = "";
      if (open && type.id === "concept")
        body = doc.o.tiers
          .map((tier) => {
            const inTier = items
              .filter((o) => num(o, "tier") === tier.id)
              .sort((a, b) => num(b, "dependents") - num(a, "dependents"));
            return inTier.length
              ? `<p class="tier-name"><b>${tier.id}</b>${esc(tier.title)}</p>${inTier.map(button).join("")}`
              : "";
          })
          .join("");
      else if (open)
        body = [...items]
          .sort((a, b) => a.title.localeCompare(b.title))
          .map(button)
          .join("");
      return `<section class="pick-type"><button type="button" class="pick-head" data-open="${type.id}" aria-expanded="${open}"><span>${esc(type.title)}</span><i>${items.length === all.length ? all.length : `${items.length} of ${all.length}`}</i></button>${body}</section>`;
    })
    .join("");
}

// ---------- V: the forms ----------
function groupsForm(): string {
  const v = view(doc, state.centre, state.question, {
    viewer: state.viewer || undefined,
  });
  return v.groups
    .map(
      (g) =>
        `<section class="group"><h4>${esc(title(state.centre))} <em>${esc(g.label)}</em>${g.derived ? '<span class="tag">derived</span>' : ""} <span class="count">${g.items.length}</span></h4><div class="chips">${g.items
          .map((item) =>
            chip(
              item.id,
              `${item.weight ? `<b>${item.weight}</b>` : ""}${item.label ? `<small>${esc(item.label)}</small>` : ""}`,
            ),
          )
          .join("")}</div></section>`,
    )
    .join("");
}
function branch(node: Branch, top = true): string {
  const kids = node.children.length
    ? `<ul>${node.children.map((child) => `<li>${branch(child, false)}</li>`).join("")}</ul>`
    : "";
  return `${top ? "" : chip(node.id)}${kids}`;
}
function treeForm(): string {
  const relation =
    doc.v.questions.find((q) => q.id === state.question)?.follows[0] ?? "";
  const t = tree(doc, state.centre, relation);
  const down = branch(t.down);
  return `${t.up.length ? `<section class="group"><h4>${esc(title(state.centre))} <em>is inside</em></h4><p class="crumbs">${t.up.map((id) => chip(id)).join("<span>›</span>")}<span>›</span><strong>${esc(title(state.centre))}</strong></p></section>` : ""}
    ${down ? `<section class="group"><h4>${esc(title(state.centre))} <em>contains</em></h4><div class="tree">${down}</div></section>` : ""}`;
}
function matrixForm(): string {
  const centre = objects.get(state.centre);
  let fns =
    centre?.type === "function"
      ? [state.centre]
      : centre?.type === "role"
        ? rels("may_do", "from", state.centre)
        : rels("has_function", "from", state.centre);
  if (!fns.length && centre) {
    const owner = rels("belongs_to", "from", state.centre)[0];
    if (owner) fns = rels("has_function", "from", owner);
  }
  if (!fns.length) return "";
  const may = new Set(
    doc.m.relations
      .filter((r) => r.type === "may_do")
      .map((r) => `${r.from}|${r.to}`),
  );
  const byModule = new Map<string, string[]>();
  for (const fn of fns) {
    const owner = rels("belongs_to", "from", fn)[0] ?? "";
    byModule.set(owner, [...(byModule.get(owner) ?? []), fn]);
  }
  return `<div class="scroll"><table class="fn"><thead><tr><th>Function</th>${doc.v.viewers.map((id) => `<th class="${state.viewer === id ? "hot" : ""}">${esc(title(id))}</th>`).join("")}</tr></thead><tbody>${[
    ...byModule,
  ]
    .map(
      ([owner, list]) =>
        `<tr class="mrow"><th colspan="${doc.v.viewers.length + 1}">${owner ? chip(owner) : ""}</th></tr>${list
          .map(
            (fn) =>
              `<tr class="${state.viewer && !may.has(`${state.viewer}|${fn}`) ? "off" : ""}"><td><button type="button" class="link" data-centre="${esc(fn)}">${esc(title(fn))}</button></td>${doc.v.viewers.map((id) => `<td class="${may.has(`${id}|${fn}`) ? "yes" : "no"}${state.viewer === id ? " hot" : ""}">${may.has(`${id}|${fn}`) ? "●" : "–"}</td>`).join("")}</tr>`,
          )
          .join("")}`,
    )
    .join("")}</tbody></table></div>
    <p class="note">Defaults of the permission rules: a person who is not the task's owner, and an agent working its own task. Roles held towards one thing (owner, worker, person in charge, supervisor) add to these; see Responsibility.</p>`;
}
function pathForm(): string {
  const centre = objects.get(state.centre);
  const flows =
    centre?.type === "flow"
      ? [state.centre]
      : centre?.type === "step"
        ? rels("step_of", "from", state.centre)
        : rels("in_flow", "from", state.centre);
  const here = new Set([
    state.centre,
    ...rels("kept_by", "from", state.centre),
  ]);
  return flows
    .map((flow) => {
      const steps = rels("step_of", "to", flow).sort(
        (a, b) => num(objects.get(a), "order") - num(objects.get(b), "order"),
      );
      return `<section class="group"><h4><button type="button" class="link" data-centre="${esc(flow)}">${esc(title(flow))}</button></h4><ol class="flow">${steps
        .map((step) => {
          const place = rels("happens_in", "from", step)[0] ?? "";
          return `<li class="${here.has(place) || step === state.centre ? "here" : ""}"><button type="button" data-centre="${esc(place)}"><strong>${esc(title(step))}</strong><em>${esc(title(place))}</em><span>${esc(objects.get(step)?.summary ?? "")}</span></button></li>`;
        })
        .join("")}</ol></section>`;
    })
    .join("");
}

function centreCard(): string {
  const o = objects.get(state.centre);
  if (!o) return "";
  const type = typeOf.get(o.type);
  const tier = doc.o.tiers.find((t) => t.id === num(o, "tier"));
  const attrs = Object.entries(o.attrs ?? {}).filter(
    ([key]) => key !== "missing",
  );
  return `<section class="centre"><p class="eyebrow">Centre · ${esc(type?.title ?? o.type)}</p><h2>${esc(o.title)}</h2>
    ${o.summary ? `<p class="lead">${esc(o.summary)}</p>` : ""}
    <dl class="facts"><div><dt>Type in O</dt><dd>${esc(type?.title ?? "")}: ${esc(type?.meaning ?? "")}</dd></div>${attrs
      .map(
        ([key, value]) =>
          `<div><dt>${esc(key)}</dt><dd>${key === "tier" && tier ? `${tier.id} · ${esc(tier.title)}` : Array.isArray(value) ? value.map((v) => `<code>${esc(v)}</code>`).join(" ") : esc(String(value))}</dd></div>`,
      )
      .join("")}</dl></section>`;
}

function definitions(): string {
  const count = (type: string) =>
    doc.m.objects.filter((o) => o.type === type).length;
  const rcount = (type: string) =>
    doc.m.relations.filter((r) => r.type === type).length;
  return `<details class="defs"><summary>O · the definitions this map uses</summary>
    <h4>Rules</h4><ul class="rules">${doc.o.rules.map((rule) => `<li>${esc(rule)}</li>`).join("")}</ul>
    <h4>Object types</h4><div class="scroll"><table class="def"><thead><tr><th>Type</th><th>Meaning</th><th>In M</th></tr></thead><tbody>${doc.o.objectTypes.map((t) => `<tr><td>${esc(t.title)}</td><td>${esc(t.meaning)}</td><td>${count(t.id)}</td></tr>`).join("")}</tbody></table></div>
    <h4>Relation types</h4><div class="scroll"><table class="def"><thead><tr><th>Read forwards</th><th>Read backwards</th><th>Meaning</th><th>Joins</th><th>In M</th></tr></thead><tbody>${doc.o.relationTypes.map((t) => `<tr><td>${esc(t.out)}${t.derived ? ' <span class="tag">derived</span>' : ""}</td><td>${esc(t.in)}</td><td>${esc(t.meaning)}</td><td>${esc(t.from.join(", "))} → ${esc(t.to.join(", "))}</td><td>${rcount(t.id)}</td></tr>`).join("")}</tbody></table></div>
    <h4>Tiers of concepts</h4><div class="scroll"><table class="def"><tbody>${doc.o.tiers.map((t) => `<tr><td>${t.id}</td><td>${esc(t.title)}</td><td>${esc(t.summary)}</td></tr>`).join("")}</tbody></table></div>
    <h4>Questions</h4><div class="scroll"><table class="def"><thead><tr><th>Question</th><th>Asks</th><th>Follows</th><th>Form</th></tr></thead><tbody>${doc.v.questions.map((q) => `<tr><td>${esc(q.title)}</td><td>${esc(q.ask)}</td><td>${esc(q.follows.join(", "))}</td><td>${esc(q.form)}</td></tr>`).join("")}</tbody></table></div></details>`;
}

function render(keepFocus = false) {
  const q = doc.v.questions.find((item) => item.id === state.question);
  const v = view(doc, state.centre, state.question, {
    viewer: state.viewer || undefined,
  });
  const body =
    q?.form === "tree"
      ? treeForm()
      : q?.form === "matrix"
        ? matrixForm()
        : q?.form === "path"
          ? pathForm()
          : groupsForm();
  const scroll = document.getElementById("picker")?.scrollTop ?? 0;
  app.innerHTML = `<header class="top"><p class="eyebrow">${esc(doc.name)} · OMV map</p><h1>${esc(q?.ask ?? "")}</h1>
    <div class="controls"><div class="seg" role="tablist" aria-label="Question">${doc.v.questions.map((item) => `<button type="button" role="tab" data-question="${item.id}" aria-selected="${item.id === state.question}" aria-pressed="${item.id === state.question}">${esc(item.title)}</button>`).join("")}</div>
    <label class="pick">Viewer<select id="viewer"><option value="">Anyone</option>${doc.v.viewers.map((id) => `<option value="${esc(id)}"${state.viewer === id ? " selected" : ""}>${esc(title(id))}</option>`).join("")}</select></label></div>
    <p class="prov"><b>View(M; o, q, c, r)</b> <span>o = ${esc(v.provenance.centre)}</span><span>q = ${esc(v.provenance.question)}</span><span>c = ${esc(v.provenance.conditions.join("; "))}</span><span>r = ${esc(v.provenance.form)}</span><span>M = ${esc(v.provenance.source)}, ${doc.m.objects.length} objects, ${doc.m.relations.length} relations</span></p></header>
    <div class="omv"><nav class="picker" id="picker" aria-label="Centre"><input id="query" type="search" placeholder="Find an object…" aria-label="Find an object" value="${esc(state.query)}">${picker()}</nav>
    <div class="stage">${centreCard()}${body || `<p class="note empty">M holds no relation of this kind for this centre. Try the question on ${chip(doc.root)} or on a module.</p>`}${q?.gap ? `<p class="note gap">${esc(q.gap)}</p>` : ""}${definitions()}</div></div>`;
  const pickerEl = document.getElementById("picker");
  if (pickerEl) pickerEl.scrollTop = scroll;
  if (keepFocus) {
    const input = document.getElementById("query") as HTMLInputElement | null;
    input?.focus();
    input?.setSelectionRange(state.query.length, state.query.length);
  }
}

app.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>(
    "[data-centre],[data-question],[data-open]",
  );
  if (!target) return;
  const d = target.dataset;
  if (d.open) {
    if (state.open.has(d.open)) state.open.delete(d.open);
    else state.open.add(d.open);
  } else if (d.question) {
    state.question = d.question;
    try {
      history.replaceState(null, "", `#${d.question}`);
    } catch {}
  } else if (d.centre && objects.has(d.centre)) state.centre = d.centre;
  render();
  if (d.centre && window.innerWidth < 980 && target.closest(".picker"))
    document
      .querySelector(".stage")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
});
app.addEventListener("change", (event) => {
  const target = event.target as HTMLSelectElement;
  if (target.id !== "viewer") return;
  state.viewer = target.value;
  render();
});
app.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id !== "query") return;
  state.query = target.value;
  render(true);
});
const fromHash = () => {
  const id = location.hash.slice(1);
  if (doc.v.questions.some((q) => q.id === id)) state.question = id;
};
window.addEventListener("hashchange", () => {
  fromHash();
  render();
});
fromHash();
render();

// func-map: set a product against a catalog of the functions its field offers.
// A catalog says what exists in the field; an assessment says, for one
// subject, which of those it has, partly has or lacks, and where. This file
// checks the two against each other and renders a table and a page.
// Plain TypeScript with erasable syntax only: Node 24 runs it directly.
//
//   node func-map.ts --catalog <file> --assessment <file>
//                    [--known <ids.json | omv.json>] [--md <out.md>]
//                    [--html <out.html>] [--generator <text>] [--check]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type Status = "yes" | "partial" | "no";
export type CatalogFunction = {
  /** Stable, lowercase, hyphenated. An assessment refers to it. */
  id: string;
  group: string;
  category: string;
  /** A capability a user would recognise, not a feature name. */
  name: string;
  /** Products given as a reference for it, as the source says. */
  seenIn: string;
};
export type Catalog = {
  domain: string;
  /** Where "seen in" comes from, and how far it can be trusted. */
  source: string;
  /** Group order on the page. */
  groups: string[];
  functions: CatalogFunction[];
};
export type Mark = { status: Status; where?: string[]; note?: string };
export type Assessment = {
  subject: string;
  /** What the "where" ids are: "objects of Taff's OMV model". */
  evidence: string;
  /** One mark per catalog function id. */
  marks: Record<string, Mark>;
};
export type Row = CatalogFunction & Required<Mark>;
export type Known = Map<string, string>;

/** Every catalog function is marked once, every claim points at something. */
export function check(
  catalog: Catalog,
  assessment: Assessment,
  known?: Known,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const fn of catalog.functions) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fn.id))
      problems.push(`function id ${fn.id} is not lowercase-hyphenated`);
    if (ids.has(fn.id)) problems.push(`function id ${fn.id} appears twice`);
    ids.add(fn.id);
    if (!catalog.groups.includes(fn.group))
      problems.push(`function ${fn.id} is in unknown group ${fn.group}`);
    const mark = assessment.marks[fn.id];
    if (!mark) {
      problems.push(`function ${fn.id} has no mark`);
      continue;
    }
    if (!["yes", "partial", "no"].includes(mark.status))
      problems.push(`function ${fn.id} has unknown status ${mark.status}`);
    if (mark.status === "partial" && !mark.note)
      problems.push(
        `function ${fn.id} is partial without a note saying what is missing`,
      );
    if (mark.status === "yes" && !mark.where?.length && !mark.note)
      problems.push(`function ${fn.id} is yes without evidence or a note`);
    if (known)
      for (const id of mark.where ?? [])
        if (!known.has(id))
          problems.push(`function ${fn.id} points at unknown ${id}`);
  }
  for (const id of Object.keys(assessment.marks))
    if (!ids.has(id)) problems.push(`mark for unknown function ${id}`);
  return problems;
}

export function rows(catalog: Catalog, assessment: Assessment): Row[] {
  return catalog.functions.map((fn) => {
    const mark = assessment.marks[fn.id] ?? { status: "no" as Status };
    return {
      ...fn,
      status: mark.status,
      where: mark.where ?? [],
      note: mark.note ?? "",
    };
  });
}

/** Reads known ids from a JSON array of ids, or from an OMV document. */
export function readKnown(file: string): Known {
  const data = JSON.parse(readFileSync(file, "utf8")) as unknown;
  const known: Known = new Map();
  if (Array.isArray(data))
    for (const id of data) known.set(String(id), String(id));
  else {
    const doc = data as {
      o?: { objectTypes?: { id: string; title: string }[] };
      m?: { objects?: { id: string; title: string; type: string }[] };
    };
    const types = new Map(
      (doc.o?.objectTypes ?? []).map((type) => [
        type.id,
        type.title.toLowerCase(),
      ]),
    );
    for (const object of doc.m?.objects ?? [])
      known.set(
        object.id,
        `${object.title} (${types.get(object.type) ?? object.type})`,
      );
  }
  return known;
}

const word: Record<Status, string> = {
  yes: "Yes",
  partial: "Partly",
  no: "No",
};
type Counts = { total: number; yes: number; partial: number; no: number };
function counts(list: Row[]): Counts {
  return {
    total: list.length,
    yes: list.filter((row) => row.status === "yes").length,
    partial: list.filter((row) => row.status === "partial").length,
    no: list.filter((row) => row.status === "no").length,
  };
}
const label = (known: Known | undefined, ids: string[]) =>
  ids.map((id) => known?.get(id) ?? id).join(", ");

export function markdown(
  catalog: Catalog,
  assessment: Assessment,
  known?: Known,
  generator = "func-map",
): string {
  const all = rows(catalog, assessment);
  const total = counts(all);
  const lines = [
    `# Function map: ${catalog.domain.toLowerCase()} and ${assessment.subject}`,
    "",
    `GENERATED by ${generator}. Do not edit.`,
    "",
    `${total.total} functions that ${catalog.domain.toLowerCase()} products offer, by group and category, and whether ${assessment.subject} has each today.`,
    "",
    `- **Seen in** names the products the catalog gives as a reference. ${catalog.source}`,
    `- **${assessment.subject}** is Yes, Partly or No. **Where** names ${assessment.evidence}.`,
    "",
    "## Overview",
    "",
    "| Group | Functions | Yes | Partly | No |",
    "| --- | --- | --- | --- | --- |",
    ...catalog.groups.map((group) => {
      const c = counts(all.filter((row) => row.group === group));
      return `| ${group} | ${c.total} | ${c.yes} | ${c.partial} | ${c.no} |`;
    }),
    `| **All** | **${total.total}** | **${total.yes}** | **${total.partial}** | **${total.no}** |`,
    "",
  ];
  for (const group of catalog.groups)
    lines.push(
      `## ${group}`,
      "",
      `| Category | Function | Seen in | ${assessment.subject} | Where in ${assessment.subject} | Note |`,
      "| --- | --- | --- | --- | --- | --- |",
      ...all
        .filter((row) => row.group === group)
        .map(
          (row) =>
            `| ${row.category} | ${row.name} | ${row.seenIn} | ${word[row.status]} | ${label(known, row.where)} | ${row.note} |`,
        ),
      "",
    );
  return lines.join("\n");
}

const esc = (value: string) =>
  value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c,
  );

/** One self-contained page. Each group folds open and shut. */
export function page(
  catalog: Catalog,
  assessment: Assessment,
  known?: Known,
): string {
  const all = rows(catalog, assessment);
  const total = counts(all);
  const subject = esc(assessment.subject);
  const bar = (c: Counts) =>
    `<span class="bar" aria-hidden="true"><i class="yes" style="width:${(c.yes / (c.total || 1)) * 100}%"></i><i class="partial" style="width:${(c.partial / (c.total || 1)) * 100}%"></i></span>`;
  const nums = (c: Counts) =>
    `<span class="n">${c.total}</span><span class="n yes">${c.yes}</span><span class="n partial">${c.partial}</span><span class="n no">${c.no}</span>${bar(c)}`;
  const groups = catalog.groups
    .map((group, index) => {
      const list = all.filter((row) => row.group === group);
      return `<details class="grp" id="g${index}"><summary><span class="name">${esc(group)}</span>${nums(counts(list))}</summary>
<div class="scroll"><table class="detail"><thead><tr><th>Category</th><th>Function</th><th>Seen in</th><th>${subject}</th><th>Where in ${subject}</th><th>Note</th></tr></thead><tbody>
${list.map((row) => `<tr><td>${esc(row.category)}</td><td>${esc(row.name)}</td><td>${esc(row.seenIn)}</td><td><span class="st ${row.status}">${word[row.status]}</span></td><td>${esc(label(known, row.where))}</td><td>${esc(row.note)}</td></tr>`).join("\n")}
</tbody></table></div></details>`;
    })
    .join("\n");
  return `<title>${subject} Function Map</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap">
<style>
/* Layout: one folding list of groups; each opens into its table of functions. */
:root { --bg:#fbf9fa; --surface:#fff; --mat:#eeebed; --ink:#0a1626; --body:#1b1b1d; --muted:#555a63; --line:rgba(10,22,38,.16); --hair:rgba(10,22,38,.08); --gold:#785f2a;
  --yes:#0f5132; --yes-bg:#d7eee0; --partial:#6b450a; --partial-bg:#f6ebd7; --no:#93000a; --no-bg:#ffdad6;
  --sans:"Manrope","PingFang HK","PingFang SC","Microsoft JhengHei","Noto Sans TC",system-ui,sans-serif; --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0a1626; --surface:#0e1b2b; --mat:#17253a; --ink:#f3f0f1; --body:#e4e2e3; --muted:#bbc7dd; --line:rgba(215,227,250,.24); --hair:rgba(215,227,250,.1); --gold:#e3c284;
  --yes:#a6dcbb; --yes-bg:#143a27; --partial:#f0d49a; --partial-bg:#4a3a14; --no:#ffb4ab; --no-bg:#5c1414; color-scheme:dark } }
:root[data-theme="dark"] { --bg:#0a1626; --surface:#0e1b2b; --mat:#17253a; --ink:#f3f0f1; --body:#e4e2e3; --muted:#bbc7dd; --line:rgba(215,227,250,.24); --hair:rgba(215,227,250,.1); --gold:#e3c284;
  --yes:#a6dcbb; --yes-bg:#143a27; --partial:#f0d49a; --partial-bg:#4a3a14; --no:#ffb4ab; --no-bg:#5c1414; color-scheme:dark }
* { box-sizing:border-box } body { background:var(--bg); color:var(--body); font:15px/1.55 var(--sans) }
.wrap { max-width:1240px; margin:0 auto; padding-block:26px 72px; padding-left:max(16px,env(safe-area-inset-left,0px)); padding-right:max(16px,env(safe-area-inset-right,0px)) }
h1 { color:var(--ink); margin:0; font-size:30px; line-height:1.2; text-wrap:balance }
p { margin:10px 0 0; max-width:76ch } .eyebrow { font:600 12px/1 var(--sans); letter-spacing:.08em; text-transform:uppercase; color:var(--gold); margin:0 0 8px }
.muted { color:var(--muted); font-size:13.5px }
.tools { margin-top:18px; display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center }
.tools button { font:600 13px/1 var(--sans); padding:9px 12px; border:1px solid var(--line); background:var(--surface); color:var(--ink); cursor:pointer }
.tools button:focus-visible, summary:focus-visible { outline:2px solid var(--gold); outline-offset:2px }
.key { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:13px; color:var(--muted) }
.list { margin-top:12px; border:1px solid var(--line); background:var(--surface) }
.head, summary { display:grid; grid-template-columns:minmax(0,1fr) repeat(4, 56px) 150px; gap:0 6px; align-items:center; padding:10px 14px }
.head { font:600 12px/1.3 var(--sans); color:var(--muted); background:var(--mat); border-bottom:1px solid var(--line) }
.head span:not(:first-child) { text-align:right } .head span:last-child { text-align:left; padding-left:10px }
.grp { border-bottom:1px solid var(--line) } .grp:last-of-type { border-bottom:0 }
summary { cursor:pointer; list-style:none } summary::-webkit-details-marker { display:none }
summary:hover { background:var(--mat) }
.name { font-weight:700; color:var(--ink); display:flex; gap:8px; align-items:baseline }
.name::before { content:"+"; font:700 14px/1 var(--mono); color:var(--gold); width:12px }
.grp[open] > summary .name::before { content:"−" }
.grp[open] > summary { background:var(--mat) }
.n { text-align:right; font-variant-numeric:tabular-nums; font-size:14px } .n.yes { color:var(--yes) } .n.partial { color:var(--partial) } .n.no { color:var(--no) }
.bar { display:flex; width:140px; height:8px; margin-left:10px; background:var(--no-bg) } .bar i { display:block; height:100% } .bar .yes { background:var(--yes) } .bar .partial { background:var(--partial) }
.total { display:grid; grid-template-columns:minmax(0,1fr) repeat(4, 56px) 150px; gap:0 6px; align-items:center; padding:10px 14px; border-top:2px solid var(--ink); font-weight:700; color:var(--ink) }
@media (max-width:640px) { .head, summary, .total { grid-template-columns:minmax(0,1fr) repeat(4, 34px) } .bar, .head span:last-child { display:none } .n { font-size:13px } }
.scroll { overflow-x:auto; border-top:1px solid var(--line) }
table { border-collapse:collapse; width:100%; font-size:13.5px; min-width:900px }
th,td { padding:8px 10px; text-align:left; vertical-align:top; border-bottom:1px solid var(--hair) }
th { font:600 12px/1.3 var(--sans); color:var(--muted); background:var(--bg); white-space:nowrap }
td:nth-child(2) { color:var(--ink); font-weight:600; min-width:230px } td:nth-child(1) { color:var(--muted); white-space:nowrap }
.st { font:700 11px/1 var(--mono); padding:4px 6px; white-space:nowrap }
.st.yes { color:var(--yes); background:var(--yes-bg) } .st.partial { color:var(--partial); background:var(--partial-bg) } .st.no { color:var(--no); background:var(--no-bg) }
</style>
<div class="wrap">
<p class="eyebrow">${subject} · function map</p>
<h1>What the field does, and what ${subject} does today</h1>
<p>${total.total} functions that ${esc(catalog.domain.toLowerCase())} products offer, grouped, each marked against ${subject} as it stands: <strong>${total.yes} yes</strong>, <strong>${total.partial} partly</strong>, <strong>${total.no} no</strong>.</p>
<p class="muted">“Seen in” names the products the catalog gives as a reference. ${esc(catalog.source)} “Where in ${subject}” names ${esc(assessment.evidence)}.</p>
<div class="tools"><button type="button" id="open-all">Open all</button><button type="button" id="close-all">Close all</button>
<span class="key"><span><span class="st yes">Yes</span> has it</span><span><span class="st partial">Partly</span> some of it exists</span><span><span class="st no">No</span> missing</span></span></div>
<div class="list"><div class="head"><span>Group · open one to see its functions</span><span>All</span><span>Yes</span><span>Partly</span><span>No</span><span>Coverage</span></div>
${groups}
<div class="total"><span>All groups</span>${nums(total)}</div></div>
</div>
<script>
(function () {
  var groups = document.querySelectorAll("details.grp");
  function all(open) { groups.forEach(function (d) { d.open = open; }); }
  document.getElementById("open-all").addEventListener("click", function () { all(true); });
  document.getElementById("close-all").addEventListener("click", function () { all(false); });
  function fromHash() { var d = location.hash && document.getElementById(location.hash.slice(1)); if (d && d.tagName === "DETAILS") { d.open = true; d.scrollIntoView(); } }
  window.addEventListener("hashchange", fromHash);
  fromHash();
})();
</script>
`;
}

async function load(file: string, name: string): Promise<unknown> {
  const module = (await import(
    pathToFileURL(path.resolve(file)).href
  )) as Record<string, unknown>;
  return module[name] ?? module.default;
}

async function main(argv: string[]) {
  const arg = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const catalogFile = arg("--catalog");
  const assessmentFile = arg("--assessment");
  if (!catalogFile || !assessmentFile) {
    console.error(
      "usage: func-map.ts --catalog <file> --assessment <file> [--known <file>] [--md <out>] [--html <out>] [--check]",
    );
    process.exit(2);
  }
  const catalog = (await load(catalogFile, "CATALOG")) as Catalog;
  const assessment = (await load(assessmentFile, "ASSESSMENT")) as Assessment;
  const knownFile = arg("--known");
  const known = knownFile ? readKnown(knownFile) : undefined;
  const problems = check(catalog, assessment, known);
  for (const line of problems) console.error(`problem: ${line}`);
  if (problems.length) process.exit(1);
  const md = arg("--md");
  const html = arg("--html");
  if (md && argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(md, "utf8");
    } catch {}
    if (current !== markdown(catalog, assessment, known, arg("--generator"))) {
      console.error(`${md} is stale`);
      process.exit(1);
    }
  } else if (md)
    writeFileSync(md, markdown(catalog, assessment, known, arg("--generator")));
  if (html) writeFileSync(html, page(catalog, assessment, known));
  const c = counts(rows(catalog, assessment));
  console.info(
    `${assessment.subject}: ${c.total} functions, ${c.yes} yes, ${c.partial} partly, ${c.no} no`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });

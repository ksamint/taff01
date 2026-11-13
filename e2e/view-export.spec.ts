import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import {
  calendarCivilTime,
  calendarWallToInstant,
  mindNodeSchema,
  projectSchema,
} from "../packages/schemas/src/index";
import { freshAccount } from "./support/account";
import { messages, type TestLocale } from "./support/messages";

// ADR 0031, VE-3: a person exports the project view and the workspace
// overview as one optimized PNG, previews it, sends it through the system
// share sheet, copies it and saves it. Runs in en, zh-CN and zh-HK.
test.use({ actionTimeout: 15000 });

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/** Records what the page hands to the system share sheet. */
async function stubShareSheet(page: Page) {
  await page.addInitScript(() => {
    const shared: { name: string; type: string; size: number }[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: (data?: { files?: File[] }) =>
        !!data?.files?.every((file) => file.type === "image/png"),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: { files: File[] }) => {
        for (const file of data.files)
          shared.push({ name: file.name, type: file.type, size: file.size });
      },
    });
  });
}

async function openExport(page: Page, title: string, width = 1080) {
  await page.getByTestId("view-export-open").click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("view-export-preview")).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(() =>
      page
        .getByTestId("view-export-preview")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(width);
  await expect(page.getByTestId("view-export-size")).toContainText(
    `${width} px`,
  );
  return dialog;
}

async function save(
  page: Page,
  kind:
    | "project"
    | "workspace"
    | "timeline"
    | "calendar"
    | "mind"
    | "relations",
) {
  const pending = page.waitForEvent("download");
  await page.getByTestId("view-export-save").click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^taff-${kind}-\\d{4}-\\d{2}-\\d{2}-[a-f0-9]{8}\\.png$`),
  );
  expect(await download.failure()).toBeNull();
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual(PNG_SIGNATURE);
  // The delivery cap from ADR 0029: small enough for chat apps.
  expect(bytes.byteLength).toBeLessThanOrEqual(400 * 1024);
  return bytes;
}

test("a person exports, sends, copies and saves project and workspace images", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  await stubShareSheet(page);
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const created = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `Export ${locale} ${Date.now()}` } },
  );
  expect(created.status()).toBe(201);
  const project = projectSchema.parse(await created.json());
  expect(
    (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: null,
          title: `Pack the samples ${locale}`,
          projectId: project.id,
        },
      })
    ).status(),
  ).toBe(201);

  // The project view: preview, send, copy, save.
  await page.goto(`/projects/${project.id}`);
  await expect(page.getByTestId("open-quick")).toBeEnabled();
  const dialog = await openExport(page, m.viewExport.title);
  await page.getByTestId("view-export-send").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as never as { __shared: unknown[] }).__shared,
      ),
    )
    .toEqual([
      {
        name: expect.stringMatching(/^taff-project-.*\.png$/),
        type: "image/png",
        size: expect.any(Number),
      },
    ]);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByTestId("view-export-copy").click();
  await expect(page.getByTestId("toast")).toContainText(m.viewExport.copied);
  await save(page, "project");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("view-export-open")).toBeFocused();

  // The workspace overview (all projects) exports every active project.
  await page.goto("/projects?all=1");
  await expect(page.getByTestId("open-quick")).toBeEnabled();
  await openExport(page, m.viewExport.title);
  await save(page, "workspace");

  // The API answers only with the caller's own rights and a valid query.
  const forbidden = await page.request.get(
    `/api/workspaces/${crypto.randomUUID()}/view-image?locale=${locale}`,
  );
  expect([403, 404]).toContain(forbidden.status());
  const invalid = await page.request.get(
    `/api/workspaces/${workspace.id}/view-image?locale=xx`,
  );
  expect(invalid.status()).toBe(400);
});

for (const graphKind of ["mind", "relations"] as const)
  test(`${graphKind} graph exports preserve visible options and render localized PNGs`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const locale = info.project.name as TestLocale;
    const me = await freshAccount(page, locale);
    const workspace = me.workspaces[0];
    const created = await page.request.post(
      `/api/projects?workspaceId=${workspace.id}`,
      { data: { name: `Graph ${locale}` } },
    );
    expect(created.status()).toBe(201);
    const project = projectSchema.parse(await created.json());
    for (const title of ["Visible task 侍", "Second task 饕餮鑫"])
      expect(
        (
          await page.request.post("/api/tasks", {
            data: {
              workspaceId: workspace.id,
              ownerId: workspace.memberId,
              workerId: null,
              projectId: project.id,
              title,
            },
          })
        ).status(),
      ).toBe(201);
    for (const [index, title] of [
      "Current hypothesis 侍",
      "Archived hypothesis 鑫",
    ].entries()) {
      const response = await page.request.post(
        `/api/workspaces/${workspace.id}/mind/nodes`,
        {
          data: {
            title,
            layer: index + 1,
            angle: 60 + index * 90,
            note: "Private note excluded from export",
          },
        },
      );
      expect(response.status()).toBe(201);
      if (index === 1) {
        const node = mindNodeSchema.parse(await response.json());
        expect(
          (
            await page.request.patch(`/api/mind/nodes/${node.id}`, {
              data: { version: node.version, archived: true },
            })
          ).status(),
        ).toBe(200);
      }
    }
    const exportGraph = async (view: "mind" | "relations", name: string) => {
      await expect(page.getByTestId("view-export-open")).toHaveCount(1);
      const pending = page.waitForResponse(
        (response) =>
          response.url().includes("/view-image?") &&
          new URL(response.url()).searchParams.get("view") === view,
      );
      await openExport(page, messages[locale].viewExport.title);
      const response = await pending;
      expect(response.status()).toBe(200);
      const query = new URL(response.url()).searchParams;
      expect(query.get("locale")).toBe(locale);
      const png = await save(page, view);
      const hash = response.headers()["x-taff-content-hash"];
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      expect(png.includes(Buffer.from(hash))).toBe(true);
      expect(png.readUInt32BE(16)).toBe(1080);
      expect(png.readUInt32BE(20)).toBeLessThanOrEqual(4000);
      expect(png[25]).toBe(3);
      await info.attach(`${name}-${locale}.png`, {
        body: png,
        contentType: "image/png",
      });
      await page.keyboard.press("Escape");
      return { hash, query, png };
    };
    if (graphKind === "mind") {
      await page.goto(`/projects/${project.id}?view=mind`);
      await expect(page.getByTestId("mind-view")).toBeVisible();
      const mind = await exportGraph("mind", "mind-current");
      expect(mind.query.get("archived")).toBe("exclude");
      expect(mind.query.has("projectId")).toBe(false);
      await page.getByTestId("mind-show-archived").click();
      const included = await exportGraph("mind", "mind-archived");
      expect(included.query.get("archived")).toBe("include");
      expect(included.hash).not.toBe(mind.hash);
      expect(included.png.equals(mind.png)).toBe(false);
      return;
    }
    await page.goto(`/projects/${project.id}?view=relations`);
    await expect(page.getByTestId("relations-view")).toBeVisible();
    await page.getByTestId("relations-as-list").click();
    await expect(page.getByTestId("view-export-open")).toHaveCount(0);
    await page.getByTestId("relations-as-list").click();
    const layered = await exportGraph("relations", "relations-layered");
    expect(layered.query.get("scope")).toBe("project");
    expect(layered.query.get("projectId")).toBe(project.id);
    expect(layered.query.get("layout")).toBe("layered");
    expect(layered.query.get("forceSeed")).toBe("7");
    await page.getByTestId("relations-layout-force").click();
    const force = await exportGraph("relations", "relations-force");
    expect(force.query.get("layout")).toBe("force");
    expect(force.hash).not.toBe(layered.hash);
    await page.getByTestId("relations-layer-all").click();
    const filtered = await exportGraph("relations", "relations-filtered");
    expect(filtered.query.get("layers")).toBe("");
    expect(filtered.hash).not.toBe(force.hash);
    await page.getByTestId("relations-scope").selectOption("workspace");
    const workspaceGraph = await exportGraph(
      "relations",
      "relations-workspace",
    );
    expect(workspaceGraph.query.get("scope")).toBe("workspace");
    expect(workspaceGraph.query.has("projectId")).toBe(false);
    expect(workspaceGraph.hash).not.toBe(filtered.hash);
  });

test("timeline exports its critical highlight and full chart in the viewer language", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const created = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `Timeline export ${locale}` } },
  );
  expect(created.status()).toBe(201);
  const project = projectSchema.parse(await created.json());
  expect(
    (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: null,
          title: `Timeline task ${locale}`,
          projectId: project.id,
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto(`/projects/${project.id}?view=timeline`);
  await expect(page.getByTestId("timeline-critical")).toBeVisible();
  await expect(page.getByTestId("view-export-open")).toHaveCount(1);
  const exported = () =>
    page.waitForResponse(
      (response) =>
        response.url().includes("/view-image?") &&
        new URL(response.url()).searchParams.get("view") === "timeline",
    );
  const first = exported();
  await openExport(page, messages[locale].viewExport.title, 1600);
  const show = await first;
  expect(new URL(show.url()).searchParams.get("criticalPath")).toBe("show");
  expect(new URL(show.url()).searchParams.get("locale")).toBe(locale);
  await save(page, "timeline");
  await page.keyboard.press("Escape");
  await page.getByTestId("timeline-critical").click();
  const second = exported();
  await openExport(page, messages[locale].viewExport.title, 1600);
  const hide = await second;
  expect(new URL(hide.url()).searchParams.get("criticalPath")).toBe("hide");
  expect(hide.headers()["x-taff-content-hash"]).not.toBe(
    show.headers()["x-taff-content-hash"],
  );
  await page.keyboard.press("Escape");
  await page.getByTestId("timeline-zoom-week").click();
  const third = exported();
  await openExport(page, messages[locale].viewExport.title, 1600);
  expect((await third).headers()["x-taff-content-hash"]).toBe(
    hide.headers()["x-taff-content-hash"],
  );
});

test("calendar exports its visible week and month, and hides export in day and list views", async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const date = calendarCivilTime(new Date(), me.user.tz)
    .toISOString()
    .slice(0, 10);
  expect(
    (
      await page.request.post("/api/tasks", {
        data: {
          workspaceId: workspace.id,
          ownerId: workspace.memberId,
          workerId: null,
          title: `Calendar export ${locale}`,
          calendar: {
            startAt: calendarWallToInstant(`${date}T09:00`, me.user.tz),
            endAt: calendarWallToInstant(`${date}T10:00`, me.user.tz),
            timeZone: me.user.tz,
            rrule: null,
          },
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto("/calendar");
  await expect(page.getByTestId("calendar-day")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("view-export-open")).toHaveCount(0);
  await page.getByTestId("calendar-week").click();
  await expect(page.getByTestId("view-export-open")).toHaveCount(1);
  const exported = () =>
    page.waitForResponse(
      (response) =>
        response.url().includes("/view-image?") &&
        new URL(response.url()).searchParams.get("view") === "calendar",
    );
  const weekResponse = exported();
  await openExport(page, messages[locale].viewExport.title, 1600);
  const week = await weekResponse;
  expect(new URL(week.url()).searchParams.get("calendarMode")).toBe("week");
  expect(new URL(week.url()).searchParams.get("visibleDate")).toBe(date);
  expect(new URL(week.url()).searchParams.has("timeZone")).toBe(false);
  await save(page, "calendar");
  await page.keyboard.press("Escape");
  await page.getByTestId("calendar-month-grid").click();
  const monthResponse = exported();
  await openExport(page, messages[locale].viewExport.title, 1600);
  const month = await monthResponse;
  expect(new URL(month.url()).searchParams.get("calendarMode")).toBe("month");
  expect(month.headers()["x-taff-content-hash"]).not.toBe(
    week.headers()["x-taff-content-hash"],
  );
  await page.keyboard.press("Escape");
  await page.getByTestId("calendar-next").click();
  const nextResponse = exported();
  await openExport(page, messages[locale].viewExport.title, 1600);
  const next = await nextResponse;
  expect(new URL(next.url()).searchParams.get("visibleDate")).not.toBe(date);
  expect(next.headers()["x-taff-content-hash"]).not.toBe(
    month.headers()["x-taff-content-hash"],
  );
  await page.keyboard.press("Escape");
  await page.getByTestId("calendar-week").click();
  await page.getByTestId("calendar-tools").click();
  await page.getByTestId("calendar-list").click();
  await expect(page.getByTestId("view-export-open")).toHaveCount(0);
  await page.getByTestId("calendar-day").click();
  await expect(page.getByTestId("view-export-open")).toHaveCount(0);
});

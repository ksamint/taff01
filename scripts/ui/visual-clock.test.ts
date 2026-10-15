import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const preload = "./scripts/ui/visual-clock.mjs";
function run(source: string, enabled = true) {
  const env = { ...process.env };
  delete env.TAFF_VISUAL_API_CLOCK;
  if (enabled) env.TAFF_VISUAL_API_CLOCK = "ui-v2";
  return spawnSync(
    process.execPath,
    ["--import", preload, "--input-type=module", "-e", source],
    {
      env,
      encoding: "utf8",
      timeout: 10_000,
    },
  );
}

test("visual API clock fails closed without its dedicated capture flag", () => {
  const result = run("console.log('must not run')", false);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(
    "requires explicit TAFF_VISUAL_API_CLOCK=ui-v2",
  );
  expect(result.stdout).not.toContain("must not run");
});

test("only concurrent Brief/Timeline GET scopes fix implicit Date reads", () => {
  const result = run(`
    import assert from 'node:assert/strict';
    import {createServer} from 'node:http';
    import {setTimeout as delay} from 'node:timers/promises';
    const wall = Date.now();
    const fixed = 1791458400000;
    class DerivedDate extends Date {}
    const server = createServer(async (req, res) => {
      await delay(req.url.includes('brief') ? 40 : 5);
      res.end(JSON.stringify({
        now: Date.now(), date: new Date().getTime(), called: Date(),
        explicit: new Date('2020-01-02T03:04:05Z').toISOString(),
        zero: new Date(0).getTime(), multi: new Date(2020, 0, 2).getFullYear(),
        derived: new DerivedDate().getTime(), instance: new Date() instanceof Date,
        parsed: Date.parse('2020-01-02T03:04:05Z'), utc: Date.UTC(2020, 0, 2),
      }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const root = 'http://127.0.0.1:' + server.address().port;
      const cases = [
        ['/api/brief?scope=all','GET',true],
        ['/api/projects/11111111-1111-4111-8111-111111111111/timeline','GET',true],
        ['/api/auth/get-session','GET',false], ['/api/health','GET',false],
        ['/api/brief','POST',false], ['/api/brief/other','GET',false],
        ['/api/projects/11111111-1111-4111-8111-111111111111/timeline','PATCH',false],
      ];
      await Promise.all(cases.map(async ([path, method, scoped]) => {
        const value = await (await fetch(root+path,{method})).json();
        if(scoped) {
          assert.equal(value.now,fixed); assert.equal(value.date,fixed);
          assert.equal(value.derived,fixed); assert.equal(value.called,new Date(fixed).toString());
        } else {
          assert.ok(value.now>=wall && value.now<wall+5000);
          assert.ok(value.date>=wall && value.derived>=wall);
          assert.notEqual(value.called,new Date(fixed).toString());
        }
        assert.equal(value.explicit,'2020-01-02T03:04:05.000Z');
        assert.equal(value.zero,0); assert.equal(value.multi,2020); assert.equal(value.instance,true);
        assert.equal(value.parsed,1577934245000); assert.equal(value.utc,1577923200000);
      }));
      assert.ok(Date.now()>=wall); assert.ok(new Date().getTime()>=wall);
      console.log('concurrent scoped and ordinary reads verified');
    } finally { await new Promise(resolve => server.close(resolve)); }
  `);
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(
    "concurrent scoped and ordinary reads verified",
  );
});

test("ordinary browser and MCP API launch configuration never preloads the clock", () => {
  expect(readFileSync("playwright.config.ts", "utf8")).not.toMatch(
    /visual-clock|TAFF_VISUAL_API_CLOCK/,
  );
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  expect(ci).not.toMatch(/TAFF_VISUAL_API_CLOCK|--import.*visual-clock/);
  const visual = readFileSync("playwright.visual.config.ts", "utf8");
  expect(visual).toContain("reuseExistingServer: false");
  expect(visual).toContain(
    'env: { ...server.env, TAFF_VISUAL_API_CLOCK: "ui-v2" }',
  );
  expect(visual).toContain(
    "node --env-file=.env --import ./scripts/ui/visual-clock.mjs node_modules/tsx/dist/cli.mjs apps/api/src/index.ts",
  );
});

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectDatabase } from "./index";
import { migrateDatabase } from "./migrate";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("Relation version tests require an isolated _test database");
const tables = [
  "company_contacts",
  "contact_roles",
  "mind_node_sources",
  "project_contacts",
  "project_payments",
  "task_contacts",
  "task_dependencies",
];

describe.skipIf(!url)("relationship and payment revisions", () => {
  let connection: ReturnType<typeof connectDatabase>;
  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
  });
  afterAll(async () => {
    await connection?.close();
  });

  it("migrates existing relationship rows without replacing their ids or payload", async () => {
    const migration = readFileSync(
      new URL("../migrations/0029_v022_relation_versions.sql", import.meta.url),
      "utf8",
    );
    await connection.client.begin(async (tx) => {
      const schema = `revision_upgrade_${randomUUID().replaceAll("-", "")}`;
      await tx`create schema ${tx(schema)}`;
      await tx`set local search_path to ${tx(schema)},public`;
      const existing = randomUUID();
      const workspace = randomUUID();
      for (const table of tables) {
        await tx`create table ${tx(table)} (id uuid primary key,workspace_id uuid not null,updated_at timestamptz not null default now(),payload text not null)`;
        await tx`insert into ${tx(table)}(id,workspace_id,payload) values (${existing},${workspace},'retained')`;
      }
      for (const statement of migration.split("--> statement-breakpoint"))
        await tx.unsafe(statement);
      for (const table of tables) {
        const [row] =
          await tx`select id,workspace_id,payload,version from ${tx(table)}`;
        expect(row, table).toEqual({
          id: existing,
          workspace_id: workspace,
          payload: "retained",
          version: 1,
        });
        const [updated] =
          await tx`update ${tx(table)} set payload='changed' returning version`;
        expect(updated.version, table).toBe(2);
      }
      await tx`drop schema ${tx(schema)} cascade`;
    });
  });

  it("defaults every row to 1 and advances revisions before the existing audit trigger", async () => {
    const client = connection.client;
    await client.begin(async (tx) => {
      const user = randomUUID();
      await tx`insert into users(id,name,email) values (${user},'Revision test',${`${user}@example.test`})`;
      const [member] =
        await tx`select id,workspace_id from members where user_id=${user}`;
      const w = member.workspace_id;
      await tx`select set_config('taff.actor_id',${user},true)`;
      const [company] =
        await tx`insert into companies(workspace_id,name) values (${w},'Company') returning id`;
      const [contact] =
        await tx`insert into contacts(workspace_id,company_id,name) values (${w},${company.id},'Contact') returning id`;
      const [project] =
        await tx`insert into projects(workspace_id,name) values (${w},'Project') returning id`;
      const [other] =
        await tx`insert into projects(workspace_id,name) values (${w},'Other project') returning id`;
      const [task] =
        await tx`insert into tasks(workspace_id,owner_id,project_id,title) values (${w},${member.id},${project.id},'Task') returning id`;
      const [successor] =
        await tx`insert into tasks(workspace_id,owner_id,project_id,title) values (${w},${member.id},${project.id},'Successor') returning id`;
      const [node] =
        await tx`insert into mind_nodes(workspace_id,title,layer,angle) values (${w},'Node',1,0) returning id`;
      const [source] =
        await tx`insert into mind_sources(workspace_id,title) values (${w},'Source') returning id`;
      await tx`insert into company_contacts(workspace_id,company_id,contact_id) values (${w},${company.id},${contact.id})`;
      await tx`insert into project_contacts(workspace_id,project_id,contact_id) values (${w},${project.id},${contact.id}),(${w},${other.id},${contact.id})`;
      await tx`insert into task_contacts(workspace_id,task_id,project_id,contact_id) values (${w},${task.id},${project.id},${contact.id})`;
      await tx`insert into contact_roles(workspace_id,contact_id,scope,role,company_id) values (${w},${contact.id},'company','decider',${company.id})`;
      await tx`insert into task_dependencies(workspace_id,predecessor_task_id,successor_task_id) values (${w},${task.id},${successor.id})`;
      await tx`insert into project_payments(workspace_id,project_id,amount,paid_on,created_by) values (${w},${project.id},'1.00','2026-10-15',${member.id})`;
      await tx`insert into mind_node_sources(workspace_id,node_id,source_id) values (${w},${node.id},${source.id})`;
      for (const table of tables) {
        const [before] =
          await tx`select id,version from ${tx(table)} where workspace_id=${w} limit 1`;
        expect(before.version, table).toBe(1);
        // A caller-supplied revision must not suppress or jump the increment.
        const [updated] =
          await tx`update ${tx(table)} set version=99,updated_at='2000-01-01' where id=${before.id} returning version,updated_at`;
        expect(updated.version, table).toBe(2);
        expect(
          new Date(updated.updated_at).getUTCFullYear(),
          table,
        ).toBeGreaterThan(2000);
        const [again] =
          await tx`update ${tx(table)} set version=0 where id=${before.id} returning version`;
        expect(again.version, table).toBe(3);
        const [audit] =
          await tx`select count(*)::int as n from activity where resource_id=${before.id} and action=${`${table}.update`}`;
        expect(audit.n, table).toBe(2);
      }
      // The real task -> task_contacts ON UPDATE CASCADE also revises the link.
      await tx`update tasks set project_id=${other.id} where id=${task.id}`;
      const [link] =
        await tx`select version,project_id from task_contacts where task_id=${task.id}`;
      expect(link).toMatchObject({ version: 4, project_id: other.id });
      // Positive check remains enforced on INSERT (the update trigger is not used).
      await expect(
        tx.savepoint(
          (save) =>
            save`insert into project_payments(workspace_id,project_id,amount,paid_on,created_by,version) values (${w},${project.id},'1.00','2026-10-15',${member.id},0)`,
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });
  });
});

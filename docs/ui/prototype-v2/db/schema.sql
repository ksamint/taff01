-- taff: main database (PostgreSQL 15+)
-- One schema serves Team Tasks (boards, inbox, calendar), Team Tasks Module Plan (timeline,
-- forecast, brief) and Team Tasks Module Relations (graph). The prototype adapter
-- (taff-store.js) mirrors these tables in the browser.

create extension if not exists "pgcrypto";

-- Tenancy -------------------------------------------------------------------
create table organizations (
  id           text primary key,                 -- 'nw', 'qs', 'me'
  name_zh      text not null,
  name_en      text not null,
  task_prefix  text not null unique,             -- 'NW' → task ids NW-141
  created_at   timestamptz not null default now()
);

create table projects (
  id           text primary key,                 -- 'chk'
  org_id       text not null references organizations(id) on delete cascade,
  name_zh      text not null,
  name_en      text not null,
  code         text not null,
  contract_amount numeric(14,2),                 -- agreed project value
  currency     char(3) not null default 'HKD',
  created_at   timestamptz not null default now()
);

-- Fees collected against a project (invoices paid). Collected = sum(amount).
create table project_payments (
  id           uuid primary key default gen_random_uuid(),
  project_id   text not null references projects(id) on delete cascade,
  amount       numeric(14,2) not null check (amount > 0),
  received_on  date not null,
  reference    text,                             -- invoice number
  created_at   timestamptz not null default now()
);

-- Humans and agents share one actor table so either can own, run or review work.
create type actor_kind as enum ('human', 'agent');
create table actors (
  id           text primary key,                 -- 'lx', 'ra'
  kind         actor_kind not null,
  name_zh      text not null,
  name_en      text not null,
  role_zh      text,
  role_en      text,
  mcp_client   text,                             -- agents: 'Claude', 'Cursor', 'MCP runtime'
  supervisor_id text references actors(id)       -- agents: accountable human
);

create table memberships (
  org_id       text references organizations(id) on delete cascade,
  actor_id     text references actors(id) on delete cascade,
  role         text not null default 'member',   -- owner | admin | member | guest
  primary key (org_id, actor_id)
);

-- Tasks (Team Tasks fields + taff plan fields) ---------------------------------
create type task_status as enum ('todo', 'doing', 'review', 'done');
create type agent_state as enum ('working', 'blocked', 'review', 'done', 'paused');

create table tasks (
  id            text primary key,                -- 'NW-141'
  org_id        text not null references organizations(id) on delete cascade,
  project_id    text not null references projects(id) on delete cascade,
  parent_id     text references tasks(id) on delete cascade,
  title_zh      text not null,
  title_en      text not null,
  description_zh text,
  description_en text,
  status        task_status not null default 'todo',
  priority      smallint not null default 3 check (priority between 1 and 4),
  owner_id      text references actors(id),      -- accountable human
  agent_id      text references actors(id),      -- executing agent, optional
  agent_state   agent_state,
  agent_steps   smallint check (agent_steps between 0 and 4),
  blocker_zh    text,
  blocker_en    text,
  needs_scope   text,                            -- e.g. 'staging.write'
  due_date      date,                            -- Team Tasks due date = last day of the bar
  duration_days smallint check (duration_days > 0),-- taff plan field; start = due_date - duration_days + 1
  sched_start   timestamptz,                     -- calendar slot (Day view)
  sched_minutes smallint,
  deliverable   text,
  created_by    text references actors(id),
  created_via   text not null default 'app',     -- app | taff | mcp | quick_add
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index tasks_project_idx on tasks(project_id);
create index tasks_due_idx on tasks(due_date);
create index tasks_agent_idx on tasks(agent_id) where agent_id is not null;

create view task_schedule as
select t.*,
       (t.due_date - coalesce(t.duration_days, case when t.priority = 1 then 3 else 2 end) + 1) as start_date,
       case t.status when 'done' then 100 when 'review' then 90
         when 'doing' then case when t.agent_id is not null and t.agent_steps is not null then 15 + t.agent_steps * 15 else 50 end
         else 0 end as progress_pct
from tasks t;

-- Project finance and delivery: delivery % is duration-weighted task progress.
create view project_overview as
select p.id, p.org_id, p.name_zh, p.name_en, p.contract_amount, p.currency,
       coalesce((select sum(amount) from project_payments pp where pp.project_id = p.id), 0) as fee_collected,
       case when p.contract_amount > 0 then round(coalesce((select sum(amount) from project_payments pp where pp.project_id = p.id), 0) / p.contract_amount * 100) end as collected_pct,
       (select round(sum(s.progress_pct * coalesce(s.duration_days, 2))::numeric / nullif(sum(coalesce(s.duration_days, 2)), 0))
          from task_schedule s where s.project_id = p.id
            and not exists (select 1 from tasks k where k.parent_id = s.id)) as delivery_pct
from projects p;

create table task_dependencies (
  predecessor_id text not null,                  -- task id or milestone id
  successor_id   text not null,
  created_by     text references actors(id),
  created_at     timestamptz not null default now(),
  primary key (predecessor_id, successor_id),
  check (predecessor_id <> successor_id)
);
-- Cycles are rejected in the API with a recursive CTE before insert.

create table milestones (
  id          text primary key,                  -- 'ms-v24'
  project_id  text not null references projects(id) on delete cascade,
  name_zh     text not null,
  name_en     text not null,
  due_date    date not null
);

create table task_activity (
  id          bigserial primary key,
  task_id     text not null references tasks(id) on delete cascade,
  actor_id    text references actors(id),
  kind        text not null check (kind in ('event', 'comment')),
  body_zh     text not null,
  body_en     text not null,
  via         text not null default 'app',       -- app | taff | mcp
  created_at  timestamptz not null default now()
);
create index task_activity_task_idx on task_activity(task_id, created_at);

-- Agent permissions and review -------------------------------------------------
create table permission_grants (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null references organizations(id) on delete cascade,
  agent_id    text not null references actors(id),
  scope       text not null,                     -- 'staging.write', 'repo.pr'
  task_id     text references tasks(id) on delete cascade,  -- null = always
  expires_at  timestamptz,
  granted_by  text not null references actors(id),
  created_at  timestamptz not null default now()
);

create table review_policies (
  org_id      text references organizations(id) on delete cascade,
  agent_id    text references actors(id),
  policy      text not null default 'always_review', -- always_review | auto_approve_low_risk
  primary key (org_id, agent_id)
);

-- AI suggestions (Approve / Dismiss / Undo in Team Tasks Module Plan) ----------------------
create table suggestions (
  id          text primary key,
  org_id      text not null references organizations(id) on delete cascade,
  project_id  text references projects(id) on delete cascade,
  task_id     text references tasks(id) on delete cascade,
  proposed_by text references actors(id),        -- agent or 'taff' planner
  title_zh    text not null,
  title_en    text not null,
  reason_zh   text,
  reason_en   text,
  action      jsonb not null,                    -- patch to apply, e.g. {"status":"done"}
  state       text not null default 'pending' check (state in ('pending', 'applied', 'dismissed', 'elsewhere')),
  undo        jsonb,                             -- previous row values captured on apply
  decided_by  text references actors(id),
  decided_at  timestamptz
);

-- Relation map: service → data → value → project ----------------------------
create type value_node_kind as enum ('service', 'data', 'value');
create table value_nodes (
  id          text primary key,                  -- 's1', 'd1', 'v1'
  org_id      text references organizations(id) on delete cascade,
  kind        value_node_kind not null,
  name_zh     text not null,
  name_en     text not null,
  metric_zh   text,
  metric_en   text
);
create table value_edges (
  from_id     text not null,                     -- value_nodes.id
  to_id       text not null,                     -- value_nodes.id or projects.id
  relation    text not null check (relation in ('FEEDS', 'YIELDS', 'DELIVERS')),
  primary key (from_id, to_id)
);

-- Consumer mindscape ----------------------------------------------------------
create type mind_layer as enum ('unconscious', 'culture', 'audience', 'scenario');
create table mind_nodes (
  id          text primary key,
  org_id      text references organizations(id) on delete cascade,
  layer       mind_layer not null,
  name_zh     text not null,
  name_en     text not null,
  insight_zh  text,
  insight_en  text,
  strength    smallint check (strength between 0 and 100),
  momentum    text check (momentum in ('up', 'flat', 'down')),
  measured_at date not null default current_date
);
create table mind_edges (
  from_id     text not null references mind_nodes(id) on delete cascade,
  to_id       text not null references mind_nodes(id) on delete cascade,
  primary key (from_id, to_id)
);
create table mind_sources (                      -- papers, industry reports, official statistics
  id          text primary key,
  kind        text not null check (kind in ('paper', 'report', 'stat', 'book')),
  citation    text not null,
  year        smallint,
  url         text,
  finding_zh  text not null,
  finding_en  text not null,
  is_caveat   boolean not null default false     -- e.g. failed replication
);
create table mind_node_sources (
  node_id     text references mind_nodes(id) on delete cascade,
  source_id   text references mind_sources(id) on delete cascade,
  primary key (node_id, source_id)
);
create table mind_node_tasks (                   -- "Turn into a validation task"
  node_id     text references mind_nodes(id) on delete cascade,
  task_id     text references tasks(id) on delete cascade,
  primary key (node_id, task_id)
);

-- Companies and contacts (CRM) ------------------------------------------------
-- One row per person in contacts; companies, projects and tasks only hold links.
-- Roles are a controlled vocabulary with a scope and an exclusivity flag.
create table companies (
  id           text primary key,
  org_id       text not null references organizations(id) on delete cascade,
  name_zh      text not null,
  name_en      text not null,
  industry_zh  text,
  industry_en  text,
  created_at   timestamptz not null default now()
);
alter table projects add column client_company_id text references companies(id) on delete set null;

create table contacts (
  id           text primary key,
  org_id       text not null references organizations(id) on delete cascade,
  company_id   text references companies(id) on delete set null,   -- employer; one per contact
  name_zh      text not null,
  name_en      text not null,
  title_zh     text,
  title_en     text,
  phone        text,
  email        text,
  created_at   timestamptz not null default now()
);

create type crm_scope as enum ('company', 'project', 'task');
create table contact_roles (
  key          text primary key,                 -- decider, chair, ops, broker, tech, finance, signoff
  name_zh      text not null,                    -- 決策者, 董事長, 運營負責人, 項目中間人 …
  name_en      text not null,
  scopes       crm_scope[] not null,             -- where the role may be used
  exclusive    boolean not null default false    -- one holder per entity (董事長, 驗收人)
);

-- A contact attached to a company, project or task. project_id is filled for
-- task links so the task ⇒ project rule can be checked and cascaded.
create table contact_links (
  id           uuid primary key default gen_random_uuid(),
  contact_id   text not null references contacts(id) on delete cascade,
  entity_type  crm_scope not null,
  entity_id    text not null,                    -- companies.id | projects.id | tasks.id
  project_id   text references projects(id) on delete cascade,
  unique (contact_id, entity_type, entity_id),
  check ((entity_type = 'task') = (project_id is not null))
);
create table contact_link_roles (
  link_id      uuid not null references contact_links(id) on delete cascade,
  role_key     text not null references contact_roles(key),
  entity_type  crm_scope not null,               -- copied from the link for the indexes below
  entity_id    text not null,
  exclusive    boolean not null default false,   -- copied from contact_roles
  primary key (link_id, role_key)
);
create unique index contact_role_exclusive on contact_link_roles (entity_type, entity_id, role_key) where exclusive;

-- Role scope + denormalised columns.
create or replace function check_link_role() returns trigger language plpgsql as $$
declare l contact_links; r contact_roles;
begin
  select * into l from contact_links where id = new.link_id;
  select * into r from contact_roles where key = new.role_key;
  if not (l.entity_type = any (r.scopes)) then
    raise exception 'role % is not allowed on %', new.role_key, l.entity_type;
  end if;
  new.entity_type := l.entity_type; new.entity_id := l.entity_id; new.exclusive := r.exclusive;
  return new;
end $$;
create trigger contact_link_roles_check before insert or update on contact_link_roles for each row execute function check_link_role();

-- A task contact must be a stakeholder of the task's project: add it if missing.
create or replace function ensure_project_link() returns trigger language plpgsql as $$
begin
  if new.entity_type = 'task' then
    insert into contact_links (contact_id, entity_type, entity_id)
    values (new.contact_id, 'project', new.project_id)
    on conflict (contact_id, entity_type, entity_id) do nothing;
  end if;
  return new;
end $$;
create trigger contact_links_project after insert on contact_links for each row execute function ensure_project_link();

-- Removing a project stakeholder removes their links on that project's tasks.
create or replace function cascade_project_unlink() returns trigger language plpgsql as $$
begin
  if old.entity_type = 'project' then
    delete from contact_links where contact_id = old.contact_id and entity_type = 'task' and project_id = old.entity_id;
  end if;
  return old;
end $$;
create trigger contact_links_cascade after delete on contact_links for each row execute function cascade_project_unlink();

-- Moving a contact to another company drops their roles at the old company.
create or replace function drop_old_company_links() returns trigger language plpgsql as $$
begin
  if old.company_id is distinct from new.company_id and old.company_id is not null then
    delete from contact_links where contact_id = new.id and entity_type = 'company' and entity_id = old.company_id;
  end if;
  return new;
end $$;
create trigger contacts_company_change after update of company_id on contacts for each row execute function drop_old_company_links();


-- Reference data: role vocabulary (keep in sync with ROLES in taff-store.js).
insert into contact_roles (key, name_zh, name_en, scopes, exclusive) values
  ('decider', '決策者', 'Decision maker', '{company,project,task}', false),
  ('chair',   '董事長', 'Chairman',       '{company}',              true),
  ('ops',     '運營負責人', 'Operations lead', '{company,project,task}', false),
  ('broker',  '項目中間人', 'Intermediary',   '{project}',              false),
  ('tech',    '技術對接人', 'Technical contact', '{project,task}',     false),
  ('finance', '財務聯繫人', 'Finance contact', '{company,project}',    false),
  ('signoff', '驗收人', 'Sign-off',       '{project,task}',         true)
on conflict (key) do nothing;

-- The linked entity must exist, belong to the contact's organisation, and a company
-- link is only allowed for the contact's own employer.
create or replace function check_link_entity() returns trigger language plpgsql as $$
declare c contacts; ok boolean;
begin
  select * into c from contacts where id = new.contact_id;
  if new.entity_type = 'company' then
    ok := exists (select 1 from companies where id = new.entity_id and org_id = c.org_id) and c.company_id = new.entity_id;
  elsif new.entity_type = 'project' then
    ok := exists (select 1 from projects where id = new.entity_id and org_id = c.org_id);
  else
    ok := exists (select 1 from tasks t where t.id = new.entity_id and t.project_id = new.project_id and t.org_id = c.org_id);
  end if;
  if not ok then raise exception 'invalid % link % for contact %', new.entity_type, new.entity_id, new.contact_id; end if;
  return new;
end $$;
create trigger contact_links_entity before insert or update on contact_links for each row execute function check_link_entity();
create or replace function check_contact_company() returns trigger language plpgsql as $$
begin
  if new.company_id is not null and not exists (select 1 from companies where id = new.company_id and org_id = new.org_id) then
    raise exception 'company % is not in organisation %', new.company_id, new.org_id;
  end if;
  return new;
end $$;
create trigger contacts_company_org before insert or update of company_id, org_id on contacts for each row execute function check_contact_company();

-- entity_id is polymorphic, so deletes are cleaned up explicitly.
create or replace function cleanup_contact_links() returns trigger language plpgsql as $$
begin
  delete from contact_links where entity_type = tg_argv[0]::crm_scope and entity_id = old.id;
  return old;
end $$;
create trigger tasks_contact_cleanup after delete on tasks for each row execute function cleanup_contact_links('task');
create trigger projects_contact_cleanup after delete on projects for each row execute function cleanup_contact_links('project');
create trigger companies_contact_cleanup after delete on companies for each row execute function cleanup_contact_links('company');
create index contact_links_entity on contact_links (entity_type, entity_id);
create index contact_links_project on contact_links (project_id) where project_id is not null;

-- MCP ------------------------------------------------------------------------
create table mcp_clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null references organizations(id) on delete cascade,
  name        text not null,
  actor_id    text references actors(id),
  scopes      text[] not null default '{tasks:read}',
  token_hash  text not null,
  last_seen_at timestamptz
);
create table mcp_calls (
  id          bigserial primary key,
  client_id   uuid references mcp_clients(id) on delete set null,
  tool        text not null,                     -- tasks.create, get_timeline …
  task_id     text,
  ok          boolean not null,
  created_at  timestamptz not null default now()
);

-- Change feed: every app subscribes so a drag in taff updates Team Tasks live.
create or replace function notify_change() returns trigger language plpgsql as $$
begin
  perform pg_notify('taff_changes', json_build_object('table', tg_table_name, 'op', tg_op,
    'id', coalesce(new.id::text, old.id::text))::text);
  return coalesce(new, old);
end $$;
create trigger tasks_notify after insert or update or delete on tasks for each row execute function notify_change();
create trigger milestones_notify after insert or update or delete on milestones for each row execute function notify_change();
create trigger contacts_notify after insert or update or delete on contacts for each row execute function notify_change();
create trigger suggestions_notify after insert or update or delete on suggestions for each row execute function notify_change();

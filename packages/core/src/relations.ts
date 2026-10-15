import {
  agentProfiles,
  companies,
  contacts,
  type Database,
  members,
  projectContacts,
  projects,
  type Transaction,
  taskContacts,
  taskDependencies,
  tasks,
  workspaces,
} from "@taff/db";
import {
  GRAPH_LAYERS,
  type GraphQuery,
  graphQuerySchema,
  idSchema,
  type RelationGraph,
  SchemaError,
} from "@taff/schemas";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import { type Action, type Actor, can, type Resource } from "./permissions";
import { relationGraph as buildRelationGraph } from "./relation-graph";

function parse<T>(schema: { parse(v: unknown): T }, v: unknown): T {
  try {
    return schema.parse(v);
  } catch (e) {
    if (e instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw e;
  }
}

type Dependencies = {
  db: Database;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
};

/** The relations graph read (M16). Read-only: no mutation path. */
export function createRelationOperations({ db, requireMember }: Dependencies) {
  async function relationGraph(
    p: Principal,
    workspaceId: string,
    query: GraphQuery = {},
  ): Promise<RelationGraph> {
    parse(idSchema, workspaceId);
    const body = parse(graphQuerySchema, query);
    const actor = await requireMember(db, p, workspaceId, "workspace:read");
    const [workspace] = await db
      .select({ id: workspaces.id, name: workspaces.name, key: workspaces.key })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (!workspace) throw new CoreError("not_found", 404);
    const projectRows = await db
      .select({
        id: projects.id,
        name: projects.name,
        archived: projects.archived,
        clientCompanyId: projects.clientCompanyId,
      })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId));
    // A project from another workspace stays private: not found.
    if (body.projectId && !projectRows.some((row) => row.id === body.projectId))
      throw new CoreError("not_found", 404);
    const crmVisible = can(actor, "contact:read", { workspaceId });
    const [taskRows, memberRows, supervisorRows, dependencyRows] =
      await Promise.all([
        db
          .select({
            id: tasks.id,
            number: tasks.number,
            title: tasks.title,
            projectId: tasks.projectId,
            parentId: tasks.parentId,
            status: tasks.status,
            ownerId: tasks.ownerId,
            workerId: tasks.workerId,
          })
          .from(tasks)
          .where(
            and(eq(tasks.workspaceId, workspaceId), isNull(tasks.archivedAt)),
          ),
        db
          .select({
            id: members.id,
            name: members.name,
            kind: members.kind,
            role: members.role,
          })
          .from(members)
          .where(eq(members.workspaceId, workspaceId)),
        db
          .select({
            agentId: agentProfiles.id,
            supervisorId: agentProfiles.supervisorId,
          })
          .from(agentProfiles)
          .where(
            and(
              eq(agentProfiles.workspaceId, workspaceId),
              isNotNull(agentProfiles.supervisorId),
            ),
          ),
        db
          .select({
            predecessorTaskId: taskDependencies.predecessorTaskId,
            successorTaskId: taskDependencies.successorTaskId,
          })
          .from(taskDependencies)
          .where(
            and(
              eq(taskDependencies.workspaceId, workspaceId),
              isNotNull(taskDependencies.predecessorTaskId),
              isNotNull(taskDependencies.successorTaskId),
            ),
          ),
      ]);
    const [companyRows, contactRows, projectLinks, taskLinks] = crmVisible
      ? await Promise.all([
          db
            .select({
              id: companies.id,
              name: companies.name,
              industry: companies.industry,
            })
            .from(companies)
            .where(
              and(
                eq(companies.workspaceId, workspaceId),
                isNull(companies.archivedAt),
              ),
            ),
          // Phone and email are never selected for the graph.
          db
            .select({
              id: contacts.id,
              name: contacts.name,
              title: contacts.title,
              companyId: contacts.companyId,
            })
            .from(contacts)
            .where(
              and(
                eq(contacts.workspaceId, workspaceId),
                isNull(contacts.archivedAt),
              ),
            ),
          db
            .select({
              projectId: projectContacts.projectId,
              contactId: projectContacts.contactId,
            })
            .from(projectContacts)
            .where(eq(projectContacts.workspaceId, workspaceId)),
          db
            .select({
              taskId: taskContacts.taskId,
              contactId: taskContacts.contactId,
            })
            .from(taskContacts)
            .where(eq(taskContacts.workspaceId, workspaceId)),
        ])
      : [[], [], [], []];
    return buildRelationGraph({
      workspace,
      projectId: body.projectId ?? null,
      layers: body.layers ?? GRAPH_LAYERS,
      crmVisible,
      projects: projectRows,
      tasks: taskRows,
      members: memberRows,
      supervisors: supervisorRows.map((row) => ({
        agentId: row.agentId,
        supervisorId: row.supervisorId as string,
      })),
      dependencies: dependencyRows.map((row) => ({
        predecessorTaskId: row.predecessorTaskId as string,
        successorTaskId: row.successorTaskId as string,
      })),
      companies: companyRows,
      contacts: contactRows,
      projectContacts: projectLinks,
      taskContacts: taskLinks,
    });
  }
  return { operations: { relationGraph } };
}

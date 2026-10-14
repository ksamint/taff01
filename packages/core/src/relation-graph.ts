import {
  GRAPH_LAYERS,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphLayer,
  type GraphNode,
  type GraphNodeKind,
  type RelationGraph,
  type TaskStatus,
} from "@taff/schemas";

/**
 * The relations read model (plan §4.3, D8, D9). A pure function: core loads
 * the workspace rows the reader may see, this builds typed nodes and edges in
 * a deterministic order. The workspace is the root; a project's company is its
 * CRM client company (D9). There is no value-chain layer (D8).
 */
export type RelationGraphInput = {
  workspace: { id: string; name: string; key: string };
  /** Limit to one project (with dependency neighbours); null for all. */
  projectId: string | null;
  layers: readonly GraphLayer[];
  /** The reader holds `contact:read`; otherwise no CRM node is built. */
  crmVisible: boolean;
  projects: {
    id: string;
    name: string;
    archived: boolean;
    clientCompanyId: string | null;
  }[];
  tasks: {
    id: string;
    number: number;
    title: string;
    projectId: string | null;
    parentId: string | null;
    status: TaskStatus;
    ownerId: string;
    workerId: string | null;
  }[];
  members: {
    id: string;
    name: string;
    kind: "person" | "agent";
    role: "admin" | "member" | "guest";
  }[];
  supervisors: { agentId: string; supervisorId: string }[];
  /** Task-to-task finish-to-start links (milestones are timeline-only). */
  dependencies: { predecessorTaskId: string; successorTaskId: string }[];
  /** Active (not archived) companies and contacts. */
  companies: { id: string; name: string; industry: string }[];
  contacts: {
    id: string;
    name: string;
    title: string;
    companyId: string | null;
  }[];
  projectContacts: { projectId: string; contactId: string }[];
  taskContacts: { taskId: string; contactId: string }[];
};

const KIND_ORDER: GraphNodeKind[] = [
  "workspace",
  "project",
  "task",
  "person",
  "agent",
  "company",
  "contact",
];
const EDGE_ORDER: GraphEdgeKind[] = [
  "contains",
  "owns",
  "works_on",
  "supervises",
  "depends_on",
  "client_of",
  "stakeholder_of",
  "contact_of",
];
const key = (kind: GraphNodeKind, id: string) => `${kind}:${id}`;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function relationGraph(input: RelationGraphInput): RelationGraph {
  const layers = GRAPH_LAYERS.filter((layer) => input.layers.includes(layer));
  const on = (layer: GraphLayer) => layers.includes(layer);
  const nodes = new Map<string, GraphNode & { order: string }>();
  const edges = new Map<string, GraphEdge>();
  const addNode = (node: GraphNode, order: string) => {
    if (!nodes.has(node.key)) nodes.set(node.key, { ...node, order });
  };
  const addEdge = (
    kind: GraphEdgeKind,
    layer: GraphLayer,
    from: string,
    to: string,
  ) => {
    if (!on(layer) || !nodes.has(from) || !nodes.has(to) || from === to) return;
    const id = `${from}|${kind}|${to}`;
    if (!edges.has(id)) edges.set(id, { key: id, kind, layer, from, to });
  };
  const root = key("workspace", input.workspace.id);
  addNode(
    {
      key: root,
      kind: "workspace",
      id: input.workspace.id,
      label: input.workspace.name,
    },
    "",
  );

  const projects = input.projects.filter((project) =>
    input.projectId ? project.id === input.projectId : !project.archived,
  );
  const projectIds = new Set(projects.map((project) => project.id));
  for (const project of projects)
    addNode(
      {
        key: key("project", project.id),
        kind: "project",
        id: project.id,
        label: project.name,
      },
      `${project.name}\u0000${project.id}`,
    );
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const inScope = (task: RelationGraphInput["tasks"][number]) =>
    task.projectId ? projectIds.has(task.projectId) : !input.projectId;
  const scoped = new Set(input.tasks.filter(inScope).map((task) => task.id));
  const taskIds = new Set(scoped);
  // A dependency into the scope brings its other end along, as a neighbour.
  if (on("dependencies"))
    for (const dep of input.dependencies) {
      const a = scoped.has(dep.predecessorTaskId);
      const b = scoped.has(dep.successorTaskId);
      if (a && !b && taskById.has(dep.successorTaskId))
        taskIds.add(dep.successorTaskId);
      if (b && !a && taskById.has(dep.predecessorTaskId))
        taskIds.add(dep.predecessorTaskId);
    }
  const tasks = input.tasks.filter((task) => taskIds.has(task.id));
  for (const task of tasks)
    addNode(
      {
        key: key("task", task.id),
        kind: "task",
        id: task.id,
        label: task.title,
        ref: `${input.workspace.key}-${task.number}`,
        projectId: task.projectId,
        parentId: task.parentId,
        status: task.status,
      },
      String(task.number).padStart(12, "0"),
    );

  // Org: the workspace contains projects, projects their top-level tasks,
  // tasks their subtasks. A task without a project hangs off the workspace.
  for (const project of projects)
    addEdge("contains", "org", root, key("project", project.id));
  for (const task of tasks) {
    const node = key("task", task.id);
    if (task.parentId && taskIds.has(task.parentId))
      addEdge("contains", "org", key("task", task.parentId), node);
    else if (task.projectId)
      addEdge("contains", "org", key("project", task.projectId), node);
    else addEdge("contains", "org", root, node);
  }

  if (on("people")) {
    const members = new Map(input.members.map((member) => [member.id, member]));
    const addMember = (id: string) => {
      const member = members.get(id);
      if (!member) return null;
      const kind = member.kind === "agent" ? "agent" : "person";
      addNode(
        {
          key: key(kind, member.id),
          kind,
          id: member.id,
          label: member.name,
          role: member.role,
        },
        `${member.name}\u0000${member.id}`,
      );
      return key(kind, member.id);
    };
    for (const task of tasks) {
      const node = key("task", task.id);
      const owner = addMember(task.ownerId);
      if (owner?.startsWith("person:")) addEdge("owns", "people", owner, node);
      if (task.workerId) {
        const worker = addMember(task.workerId);
        if (worker) addEdge("works_on", "people", worker, node);
      }
    }
    for (const row of input.supervisors)
      addEdge(
        "supervises",
        "people",
        key("person", row.supervisorId),
        key("agent", row.agentId),
      );
  }

  if (on("dependencies"))
    for (const dep of input.dependencies)
      addEdge(
        "depends_on",
        "dependencies",
        key("task", dep.successorTaskId),
        key("task", dep.predecessorTaskId),
      );

  if (input.crmVisible) {
    const companies = new Map(input.companies.map((row) => [row.id, row]));
    const contacts = new Map(input.contacts.map((row) => [row.id, row]));
    const addCompany = (id: string) => {
      const company = companies.get(id);
      if (!company) return null;
      addNode(
        {
          key: key("company", id),
          kind: "company",
          id,
          label: company.name,
          detail: company.industry,
        },
        `${company.name}\u0000${id}`,
      );
      return key("company", id);
    };
    const addContact = (id: string) => {
      const contact = contacts.get(id);
      if (!contact) return null;
      // Never phone or email: the graph is shared with every CRM reader.
      addNode(
        {
          key: key("contact", id),
          kind: "contact",
          id,
          label: contact.name,
          detail: contact.title,
        },
        `${contact.name}\u0000${id}`,
      );
      return key("contact", id);
    };
    if (on("org"))
      for (const project of projects) {
        const company = project.clientCompanyId
          ? addCompany(project.clientCompanyId)
          : null;
        if (company)
          addEdge("client_of", "org", company, key("project", project.id));
      }
    if (on("crm")) {
      for (const link of input.projectContacts) {
        if (!projectIds.has(link.projectId)) continue;
        const contact = addContact(link.contactId);
        if (contact)
          addEdge(
            "stakeholder_of",
            "crm",
            contact,
            key("project", link.projectId),
          );
      }
      for (const link of input.taskContacts) {
        if (!taskIds.has(link.taskId)) continue;
        const contact = addContact(link.contactId);
        if (contact)
          addEdge("stakeholder_of", "crm", contact, key("task", link.taskId));
      }
      for (const contact of input.contacts) {
        if (!nodes.has(key("contact", contact.id)) || !contact.companyId)
          continue;
        const company = addCompany(contact.companyId);
        if (company)
          addEdge("contact_of", "crm", key("contact", contact.id), company);
      }
    }
  }

  const sortedNodes = [...nodes.values()]
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        byText(a.order, b.order) ||
        byText(a.id, b.id),
    )
    .map(({ order: _order, ...node }) => node);
  const sortedEdges = [...edges.values()].sort(
    (a, b) =>
      GRAPH_LAYERS.indexOf(a.layer) - GRAPH_LAYERS.indexOf(b.layer) ||
      EDGE_ORDER.indexOf(a.kind) - EDGE_ORDER.indexOf(b.kind) ||
      byText(a.from, b.from) ||
      byText(a.to, b.to),
  );
  return {
    workspaceId: input.workspace.id,
    projectId: input.projectId,
    layers,
    crmVisible: input.crmVisible,
    nodes: sortedNodes,
    edges: sortedEdges,
  };
}

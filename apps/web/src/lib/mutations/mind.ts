// Mind map writes (M18). Every write is optimistic on both cached maps of
// the workspace (active and with archived rows), rolls back on error, sends
// the row's `version` where the row has one, and toasts with 撤銷 whose undo
// calls the inverse API operation (plan §2.4), never a cache snapshot:
// a create archives (admins, mind:archive), an edit PATCHes the previous
// fields with the new version, an archive restores, a link removal re-adds
// the link. A validation task is a real task and tasks are never deleted,
// so that toast opens the task instead (see docs/milestones/18-mind-map.md).
import {
  type MindEdge,
  type MindEdgeInput,
  type MindEdgeUpdate,
  type MindMap,
  type MindNode,
  type MindNodeInput,
  type MindNodeUpdate,
  type MindSource,
  type MindSourceInput,
  type MindSourceUpdate,
  type MindValidationTaskInput,
  type MindValidationTaskResult,
  mindEdgeSchema,
  mindNodeSchema,
  mindNodeSourceSchema,
  mindSourceSchema,
  mindValidationTaskResultSchema,
} from "@taff/schemas/mind";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ApiError, errorKey, request } from "../api";
import {
  hasEdge,
  withEdge,
  withLink,
  withNode,
  withoutEdge,
  withoutLink,
  withSource,
} from "../mind-model";
import { mindKey } from "../mind-queries";
import { restoreQueries, snapshotQueries } from "../query-snapshot";
import { showToast, type ToastAction } from "../toast";

export const mindMutationKey = ["mind-write"] as const;
const MIND = ["mind-map"];
/** A validation task also changes task lists, the timeline and the brief. */
const TASK_FAMILIES = [
  "mind-map",
  "tasks",
  "task",
  "timeline",
  "graph",
  "brief",
  "calendar",
];

type Edit = (map: MindMap, includeArchived: boolean) => MindMap;

function invalidate(client: QueryClient, families: string[]) {
  if (client.isMutating({ mutationKey: mindMutationKey }) > 1) return;
  return client.invalidateQueries({
    predicate: ({ queryKey }) => families.includes(String(queryKey[0])),
  });
}

/** Applies an edit to both cached maps; resolves to the rollback snapshot. */
async function applyEdit(client: QueryClient, workspaceId: string, edit: Edit) {
  const keys = [mindKey(workspaceId, false), mindKey(workspaceId, true)];
  const snapshot = await snapshotQueries(client, keys);
  for (const key of keys)
    client.setQueryData<MindMap>(key, (map) =>
      map ? edit(map, key[2] === "include") : map,
    );
  return snapshot;
}

/** Runs an inverse call (undo) as a tracked mutation, then refreshes. */
function runInverse(
  client: QueryClient,
  t: TFunction,
  workspaceId: string,
  call: () => Promise<unknown>,
  edit?: Edit,
) {
  const mutation = client.getMutationCache().build(client, {
    mutationKey: mindMutationKey,
    mutationFn: call,
    onMutate: () => (edit ? applyEdit(client, workspaceId, edit) : undefined),
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot as Parameters<typeof restoreQueries>[1]);
      showToast(t(errorKey(error)));
    },
    onSettled: () => invalidate(client, MIND),
  });
  void mutation.execute(undefined).catch(() => {});
}
const undo = (t: TFunction, run: () => void): ToastAction => ({
  label: t("actions.undo"),
  run,
});

let optimisticSequence = 0;
const optimisticId = () => `optimistic:${++optimisticSequence}`;
const now = () => new Date().toISOString();

const patchNode = async (id: string, body: MindNodeUpdate) =>
  mindNodeSchema.parse(
    await request(`/api/mind/nodes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
const patchSource = async (id: string, body: MindSourceUpdate) =>
  mindSourceSchema.parse(
    await request(`/api/mind/sources/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  );
const postEdge = async (workspaceId: string, body: MindEdgeInput) =>
  mindEdgeSchema.parse(
    await request(`/api/workspaces/${workspaceId}/mind/edges`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
const linkPath = (nodeId: string, sourceId: string) =>
  `/api/mind/nodes/${nodeId}/sources/${sourceId}`;

export type NodeFields = Required<MindNodeInput>;

/**
 * Creates a node or saves its fields. Undo archives a new node (only with
 * `canArchive`) or PATCHes the previous fields with the new version.
 */
export function useSaveMindNode(workspaceId: string, canArchive: boolean) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: mindMutationKey,
    mutationFn: async ({
      node,
      fields,
    }: {
      node: MindNode | null;
      fields: NodeFields;
      onSaved?: (node: MindNode) => void;
    }) =>
      node
        ? patchNode(node.id, { version: node.version, ...fields })
        : mindNodeSchema.parse(
            await request(`/api/workspaces/${workspaceId}/mind/nodes`, {
              method: "POST",
              body: JSON.stringify(fields satisfies MindNodeInput),
            }),
          ),
    onMutate: async ({ node, fields }) => {
      const tempId = node?.id ?? optimisticId();
      const snapshot = await applyEdit(client, workspaceId, (map, all) =>
        withNode(
          map,
          node
            ? { ...node, ...fields }
            : {
                id: tempId,
                workspaceId,
                ...fields,
                taskId: null,
                archivedAt: null,
                version: 1,
                createdAt: now(),
                updatedAt: now(),
              },
          all,
        ),
      );
      return { snapshot, tempId };
    },
    onError: (error, _, context) => {
      restoreQueries(client, context?.snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (saved, { node, onSaved }, context) => {
      // The saved row replaces the optimistic one so it can be selected now.
      for (const archived of [false, true])
        client.setQueryData<MindMap>(mindKey(workspaceId, archived), (map) =>
          map
            ? withNode(
                {
                  ...map,
                  nodes: map.nodes.filter((item) => item.id !== context.tempId),
                },
                saved,
                archived,
              )
            : map,
        );
      onSaved?.(saved);
      if (!node)
        showToast(
          t("mind.toast.nodeCreated", { title: saved.title }),
          canArchive
            ? undo(t, () =>
                runInverse(
                  client,
                  t,
                  workspaceId,
                  () =>
                    patchNode(saved.id, {
                      version: saved.version,
                      archived: true,
                    }),
                  (map, all) =>
                    withNode(map, { ...saved, archivedAt: now() }, all),
                ),
              )
            : undefined,
        );
      else {
        const previous = {
          title: node.title,
          layer: node.layer,
          angle: node.angle,
          strength: node.strength,
          momentum: node.momentum,
          note: node.note,
        };
        showToast(
          t("mind.toast.nodeSaved", { title: saved.title }),
          undo(t, () =>
            runInverse(
              client,
              t,
              workspaceId,
              () =>
                patchNode(saved.id, { version: saved.version, ...previous }),
              (map, all) => withNode(map, { ...saved, ...previous }, all),
            ),
          ),
        );
      }
    },
    onSettled: () => invalidate(client, MIND),
  });
}

/** Archives (admins) or restores a node; undo does the opposite. */
export function useArchiveMindNode(workspaceId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: mindMutationKey,
    mutationFn: ({ node, archived }: { node: MindNode; archived: boolean }) =>
      patchNode(node.id, { version: node.version, archived }),
    onMutate: ({ node, archived }) =>
      applyEdit(client, workspaceId, (map, all) =>
        withNode(map, { ...node, archivedAt: archived ? now() : null }, all),
      ),
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (saved, { archived }) =>
      showToast(
        t(archived ? "mind.toast.nodeArchived" : "mind.toast.nodeRestored", {
          title: saved.title,
        }),
        undo(t, () =>
          runInverse(
            client,
            t,
            workspaceId,
            () =>
              patchNode(saved.id, {
                version: saved.version,
                archived: !archived,
              }),
            (map, all) =>
              withNode(
                map,
                { ...saved, archivedAt: archived ? null : now() },
                all,
              ),
          ),
        ),
      ),
    onSettled: () => invalidate(client, MIND),
  });
}

/** Links two nodes; a pair already linked (either way) is caught first. */
export function useAddMindEdge(workspaceId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  const mutation = useMutation({
    mutationKey: mindMutationKey,
    mutationFn: (body: MindEdgeInput) => postEdge(workspaceId, body),
    onMutate: (body) =>
      applyEdit(client, workspaceId, (map) =>
        withEdge(map, {
          id: optimisticId(),
          workspaceId,
          fromNodeId: body.fromNodeId,
          toNodeId: body.toNodeId,
          kind: body.kind ?? "relates",
          version: 1,
          createdAt: now(),
        }),
      ),
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(
        error instanceof ApiError && error.status === 409
          ? t("mind.toast.edgeExists")
          : t(errorKey(error)),
      );
    },
    onSuccess: (edge) =>
      showToast(
        t("mind.toast.edgeAdded"),
        undo(t, () =>
          runInverse(
            client,
            t,
            workspaceId,
            () => request(`/api/mind/edges/${edge.id}`, { method: "DELETE" }),
            (map) => withoutEdge(map, edge.id),
          ),
        ),
      ),
    onSettled: () => invalidate(client, MIND),
  });
  const add = (body: MindEdgeInput) => {
    if (body.fromNodeId === body.toNodeId) return false;
    const map = client.getQueryData<MindMap>(mindKey(workspaceId, false));
    if (hasEdge(map, body.fromNodeId, body.toNodeId)) {
      showToast(t("mind.toast.edgeExists"));
      return false;
    }
    mutation.mutate(body);
    return true;
  };
  return { ...mutation, add };
}

/** Changes a link's kind with its version; undo sets the old kind back. */
export function useUpdateMindEdge(workspaceId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: mindMutationKey,
    mutationFn: async ({
      edge,
      kind,
    }: {
      edge: MindEdge;
      kind: MindEdge["kind"];
    }) =>
      mindEdgeSchema.parse(
        await request(`/api/mind/edges/${edge.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            version: edge.version,
            kind,
          } satisfies MindEdgeUpdate),
        }),
      ),
    onMutate: ({ edge, kind }) =>
      applyEdit(client, workspaceId, (map) => withEdge(map, { ...edge, kind })),
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (saved, { edge }) =>
      showToast(
        t("mind.toast.edgeChanged", { kind: t(`mind.edgeKind.${saved.kind}`) }),
        undo(t, () =>
          runInverse(
            client,
            t,
            workspaceId,
            () =>
              request(`/api/mind/edges/${saved.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  version: saved.version,
                  kind: edge.kind,
                } satisfies MindEdgeUpdate),
              }),
            (map) => withEdge(map, { ...saved, kind: edge.kind }),
          ),
        ),
      ),
    onSettled: () => invalidate(client, MIND),
  });
}

/** Removes a link; undo re-adds it from the returned row. */
export function useRemoveMindEdge(workspaceId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: mindMutationKey,
    mutationFn: async (edge: MindEdge) =>
      mindEdgeSchema.parse(
        await request(`/api/mind/edges/${edge.id}`, { method: "DELETE" }),
      ),
    onMutate: (edge) =>
      applyEdit(client, workspaceId, (map) => withoutEdge(map, edge.id)),
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (row) =>
      showToast(
        t("mind.toast.edgeRemoved"),
        undo(t, () =>
          runInverse(
            client,
            t,
            workspaceId,
            () =>
              postEdge(workspaceId, {
                fromNodeId: row.fromNodeId,
                toNodeId: row.toNodeId,
                kind: row.kind,
              }),
            (map) => withEdge(map, row),
          ),
        ),
      ),
    onSettled: () => invalidate(client, MIND),
  });
}

export type SourceFields = { title: string; url: string | null; note: string };

/**
 * Creates a source (and, with `linkTo`, adds it as evidence to that node) or
 * saves its fields. Undo archives a new source (admins) or restores the
 * previous fields.
 */
export function useSaveMindSource(workspaceId: string, canArchive: boolean) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: mindMutationKey,
    mutationFn: async ({
      source,
      fields,
      linkTo,
    }: {
      source: MindSource | null;
      fields: SourceFields;
      linkTo?: string | null;
    }) => {
      if (source)
        return patchSource(source.id, { version: source.version, ...fields });
      const created = mindSourceSchema.parse(
        await request(`/api/workspaces/${workspaceId}/mind/sources`, {
          method: "POST",
          body: JSON.stringify(fields satisfies MindSourceInput),
        }),
      );
      if (linkTo)
        mindNodeSourceSchema.parse(
          await request(linkPath(linkTo, created.id), { method: "PUT" }),
        );
      return created;
    },
    onMutate: ({ source, fields, linkTo }) => {
      const id = source?.id ?? optimisticId();
      return applyEdit(client, workspaceId, (map, all) => {
        const next = withSource(
          map,
          source
            ? { ...source, ...fields }
            : {
                id,
                workspaceId,
                ...fields,
                archivedAt: null,
                version: 1,
                createdAt: now(),
                updatedAt: now(),
              },
          all,
        );
        return linkTo && !source
          ? withLink(next, {
              id: optimisticId(),
              workspaceId,
              nodeId: linkTo,
              sourceId: id,
              createdAt: now(),
            })
          : next;
      });
    },
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (saved, { source }) => {
      if (!source)
        showToast(
          t("mind.toast.sourceCreated", { title: saved.title }),
          canArchive
            ? undo(t, () =>
                runInverse(
                  client,
                  t,
                  workspaceId,
                  () =>
                    patchSource(saved.id, {
                      version: saved.version,
                      archived: true,
                    }),
                  (map, all) =>
                    withSource(map, { ...saved, archivedAt: now() }, all),
                ),
              )
            : undefined,
        );
      else {
        const previous = {
          title: source.title,
          url: source.url,
          note: source.note,
        };
        showToast(
          t("mind.toast.sourceSaved", { title: saved.title }),
          undo(t, () =>
            runInverse(
              client,
              t,
              workspaceId,
              () =>
                patchSource(saved.id, { version: saved.version, ...previous }),
              (map, all) => withSource(map, { ...saved, ...previous }, all),
            ),
          ),
        );
      }
    },
    onSettled: () => invalidate(client, MIND),
  });
}

/** Archives (admins) or restores a source; undo does the opposite. */
export function useArchiveMindSource(workspaceId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: mindMutationKey,
    mutationFn: ({
      source,
      archived,
    }: {
      source: MindSource;
      archived: boolean;
    }) => patchSource(source.id, { version: source.version, archived }),
    onMutate: ({ source, archived }) =>
      applyEdit(client, workspaceId, (map, all) =>
        withSource(
          map,
          { ...source, archivedAt: archived ? now() : null },
          all,
        ),
      ),
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (saved, { archived }) =>
      showToast(
        t(
          archived ? "mind.toast.sourceArchived" : "mind.toast.sourceRestored",
          { title: saved.title },
        ),
        undo(t, () =>
          runInverse(
            client,
            t,
            workspaceId,
            () =>
              patchSource(saved.id, {
                version: saved.version,
                archived: !archived,
              }),
            (map, all) =>
              withSource(
                map,
                { ...saved, archivedAt: archived ? null : now() },
                all,
              ),
          ),
        ),
      ),
    onSettled: () => invalidate(client, MIND),
  });
}

type LinkVariables = { node: MindNode; source: MindSource };

/** Adds a source to a node as evidence; undo removes it. */
export function useLinkMindSource(workspaceId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: mindMutationKey,
    mutationFn: async ({ node, source }: LinkVariables) =>
      mindNodeSourceSchema.parse(
        await request(linkPath(node.id, source.id), { method: "PUT" }),
      ),
    onMutate: ({ node, source }) =>
      applyEdit(client, workspaceId, (map) =>
        withLink(map, {
          id: optimisticId(),
          workspaceId,
          nodeId: node.id,
          sourceId: source.id,
          createdAt: now(),
        }),
      ),
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (_, { node, source }) =>
      showToast(
        t("mind.toast.evidenceAdded", {
          source: source.title,
          title: node.title,
        }),
        undo(t, () =>
          runInverse(
            client,
            t,
            workspaceId,
            () => request(linkPath(node.id, source.id), { method: "DELETE" }),
            (map) => withoutLink(map, node.id, source.id),
          ),
        ),
      ),
    onSettled: () => invalidate(client, MIND),
  });
}

/** Removes a source from a node's evidence; undo adds it back. */
export function useUnlinkMindSource(workspaceId: string) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: mindMutationKey,
    mutationFn: async ({ node, source }: LinkVariables) =>
      mindNodeSourceSchema.parse(
        await request(linkPath(node.id, source.id), { method: "DELETE" }),
      ),
    onMutate: ({ node, source }) =>
      applyEdit(client, workspaceId, (map) =>
        withoutLink(map, node.id, source.id),
      ),
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (row, { node, source }) =>
      showToast(
        t("mind.toast.evidenceRemoved", {
          source: source.title,
          title: node.title,
        }),
        undo(t, () =>
          runInverse(
            client,
            t,
            workspaceId,
            () => request(linkPath(node.id, source.id), { method: "PUT" }),
            (map) => withLink(map, row),
          ),
        ),
      ),
    onSettled: () => invalidate(client, MIND),
  });
}

/**
 * "Turn into a validation task": the person confirms title, project and due
 * date; the server creates a real task they own and links it. Tasks are
 * never deleted, so the toast offers to open the task rather than undo.
 */
export function useCreateValidationTask(
  workspaceId: string,
  openTask: (taskId: string) => void,
) {
  const client = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationKey: mindMutationKey,
    mutationFn: async ({
      node,
      body,
    }: {
      node: MindNode;
      body: Omit<MindValidationTaskInput, "version">;
      reference: (result: MindValidationTaskResult) => string;
    }) =>
      mindValidationTaskResultSchema.parse(
        await request(`/api/mind/nodes/${node.id}/task`, {
          method: "POST",
          body: JSON.stringify({
            version: node.version,
            ...body,
          } satisfies MindValidationTaskInput),
        }),
      ),
    onMutate: ({ node }) =>
      applyEdit(client, workspaceId, (map, all) =>
        withNode(map, { ...node, taskId: optimisticId() }, all),
      ),
    onError: (error, _, snapshot) => {
      restoreQueries(client, snapshot);
      showToast(t(errorKey(error)));
    },
    onSuccess: (result, { reference }) => {
      for (const archived of [false, true])
        client.setQueryData<MindMap>(mindKey(workspaceId, archived), (map) =>
          map ? withNode(map, result.node, archived) : map,
        );
      showToast(
        t("mind.toast.taskMade", {
          ref: reference(result),
          title: result.task.title,
        }),
        { label: t("mind.openTask"), run: () => openTask(result.task.id) },
      );
    },
    onSettled: () => invalidate(client, TASK_FAMILIES),
  });
}

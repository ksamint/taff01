/** Close only pending proposals on tasks created and journaled by this run. */
type Proposal = {
  id: string;
  workspaceId: string;
  taskId: string | null;
  version: number;
  status: string;
};
export async function cleanupSuggestion(
  entry: { id: string; workspaceId?: string; taskId?: string },
  workspaceId: string | undefined,
  ownedTaskIds: Set<string>,
  api: {
    list(taskId: string): Promise<Proposal[]>;
    dismiss(id: string, version: number): Promise<Proposal>;
    fail(): never;
  },
) {
  if (
    !workspaceId ||
    entry.workspaceId !== workspaceId ||
    !entry.taskId ||
    !ownedTaskIds.has(entry.taskId)
  )
    return api.fail();
  const proposal = (await api.list(entry.taskId)).find(
    (row) => row.id === entry.id,
  );
  if (
    !proposal ||
    proposal.workspaceId !== workspaceId ||
    proposal.taskId !== entry.taskId
  )
    return api.fail();
  if (proposal.status !== "pending") return;
  const saved = await api.dismiss(proposal.id, proposal.version);
  if (
    saved.id !== proposal.id ||
    saved.workspaceId !== workspaceId ||
    saved.taskId !== entry.taskId ||
    saved.status !== "dismissed"
  )
    return api.fail();
}

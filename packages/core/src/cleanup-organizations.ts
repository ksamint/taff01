/** Explicit, reversible production cleanup; dry run unless --apply is supplied.
 * KEEP_WORKSPACE_IDS is a JSON array of the exact organization IDs to retain.
 * Personal workspaces are always retained. Credentials come from runtime env.
 */
import { CoreError, createCore, userPrincipal } from "./index";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const core = createCore({
  databaseUrl: required("DATABASE_URL"),
  authUrl: required("AUTH_URL"),
  authSecret: required("AUTH_SECRET"),
  tokenPepper: required("TOKEN_PEPPER"),
});
try {
  const principal = userPrincipal(required("CLEANUP_ADMIN_USER_ID"));
  const keep: unknown = JSON.parse(required("KEEP_WORKSPACE_IDS"));
  if (
    !Array.isArray(keep) ||
    !keep.length ||
    keep.some((id) => typeof id !== "string")
  )
    throw new Error("explicit keep IDs required");
  const rows = await core.listWorkspaceAdministration(principal);
  if (
    keep.some(
      (id) =>
        !rows.some(
          (row) => row.id === id && !row.archivedAt && !row.personalOwnerId,
        ),
    )
  )
    throw new Error(
      "keep list contains missing, archived or personal workspace",
    );
  const extras = rows.filter(
    (row) => !row.archivedAt && !row.personalOwnerId && !keep.includes(row.id),
  );
  console.log(
    JSON.stringify(
      {
        mode: process.argv.includes("--apply") ? "apply" : "dry-run",
        personalRetained: rows.filter((row) => row.personalOwnerId).length,
        retained: rows.filter((row) => keep.includes(row.id)),
        archive: extras,
      },
      null,
      2,
    ),
  );
  if (process.argv.includes("--apply")) {
    for (const row of extras) await core.archiveWorkspace(principal, row.id);
    console.log(JSON.stringify({ archived: extras.length }));
  }
} catch (error) {
  console.error(error instanceof CoreError ? error.code : "cleanup_failed");
  process.exitCode = 1;
} finally {
  await core.close();
}

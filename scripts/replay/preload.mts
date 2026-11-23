import { appendFileSync, constants, openSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { createObserver } from "./capture.mts";

const dir = process.env.TAFF_REPLAY_DIR;
if (dir && process.env.NODE_ENV !== "production") {
  const root = join(resolve(import.meta.dirname, "../.."), ".taff-replay");
  for (const name of ["DATABASE_URL", "TEST_DATABASE_URL"]) {
    const raw = process.env[name];
    if (!raw) continue;
    const url = new URL(raw);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
      throw new Error("replay capture requires loopback databases");
  }
  const folder = realpathSync(dir);
  if (folder !== resolve(dir) || !folder.startsWith(realpathSync(root) + "/"))
    throw new Error("replay capture requires an owned ignored run folder");
  const file = openSync(
    join(folder, `observations-${process.pid}.ndjson`),
    constants.O_CREAT |
      constants.O_APPEND |
      constants.O_NOFOLLOW |
      constants.O_WRONLY,
    0o600,
  );
  Object.assign(globalThis, {
    taffReplayObserve: createObserver((entry) =>
      appendFileSync(file, `${JSON.stringify(entry)}\n`),
    ),
  });
}

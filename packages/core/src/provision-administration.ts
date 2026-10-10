import { fileURLToPath } from "node:url";
import { administrationProvisionSchema } from "@taff/schemas";
import { CoreError, createCore } from "./index";

/** Private deployment entry: credentials and identity input are never CLI arguments. */
async function main() {
  let core: ReturnType<typeof createCore> | undefined;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of process.stdin) {
      const bytes = Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > 16_384) throw new CoreError("invalid_input", 400);
      chunks.push(bytes);
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new CoreError("invalid_input", 400);
    }
    const parsed = administrationProvisionSchema.safeParse(input);
    if (!parsed.success) throw new CoreError("invalid_input", 400);
    const { DATABASE_URL, AUTH_URL, AUTH_SECRET, TOKEN_PEPPER } = process.env;
    if (
      !DATABASE_URL ||
      !AUTH_URL ||
      !AUTH_SECRET ||
      AUTH_SECRET.length < 32 ||
      !TOKEN_PEPPER ||
      TOKEN_PEPPER.length < 16
    )
      throw new CoreError("invalid_input", 400);
    let validUrls = false;
    try {
      validUrls =
        ["postgres:", "postgresql:"].includes(new URL(DATABASE_URL).protocol) &&
        ["http:", "https:"].includes(new URL(AUTH_URL).protocol);
    } catch {
      /* Fail closed without showing supplied values. */
    }
    if (!validUrls) throw new CoreError("invalid_input", 400);
    core = createCore({
      databaseUrl: DATABASE_URL,
      authUrl: AUTH_URL,
      authSecret: AUTH_SECRET,
      tokenPepper: TOKEN_PEPPER,
    });
    console.log(
      JSON.stringify(await core.provisionAdministration(parsed.data)),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        error:
          error instanceof CoreError ? error.code : "administration_failed",
      }),
    );
    process.exitCode = 1;
  } finally {
    try {
      await core?.close();
    } catch {
      console.error(JSON.stringify({ error: "administration_failed" }));
      process.exitCode = 1;
    }
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  await main();

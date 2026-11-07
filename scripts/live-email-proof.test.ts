import { describe, expect, it, vi } from "vitest";
import {
  type ProofRunner,
  readEmailProof,
  shellQuote,
} from "../e2e/live/email-proof.mts";

const email = "taff-v020-verify-0123456789ab@example.test";
const now = () => 1_800_000_000_000;
const after = String(now() - 5_000);
const env = {
  TAFF_VERIFY_SSH_TARGET: "taff-prod",
  TAFF_VERIFY_API_ID: "abcdef012345",
};

describe("live e-mail proof bridge", () => {
  it("rejects unexpected recipients, stale requests and unsafe targets without running ssh", async () => {
    const run = vi.fn<ProofRunner>();
    for (const [address, requested, variables] of [
      ["someone@example.com", after, env],
      [email, String(now() - 181_000), env],
      [email, String(now() + 1_000), env],
      [email, "12x", env],
      [email, after, { ...env, TAFF_VERIFY_SSH_TARGET: "host;rm -rf /" }],
      [email, after, { ...env, TAFF_VERIFY_API_ID: "XYZ" }],
    ] as const)
      expect(
        await readEmailProof(address, requested, variables, run, now),
      ).toEqual({ ok: false });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs one batch-mode ssh with a quoted remote command and the script on stdin", async () => {
    const run = vi.fn<ProofRunner>().mockResolvedValue({
      code: 0,
      stdout: JSON.stringify({ ok: true, token: "secret-token" }),
    });
    expect(await readEmailProof(email, after, env, run, now)).toEqual({
      ok: true,
      token: "secret-token",
    });
    const [command, args, options] = run.mock.calls[0];
    expect(command).toBe("ssh");
    expect(args).toEqual([
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=10",
      "taff-prod",
      `sudo -n docker exec -i -e TAFF_RECIPIENT=${email} -e TAFF_REQUEST_AFTER=${after} abcdef012345 node --input-type=module`,
    ]);
    expect(options.timeout).toBe(25_000);
    expect(options.input).toContain("#verifyEmail=");
    expect(options.input).toContain("split('\\n')");
  });

  it("answers ok:false for a failed, malformed or tokenless reply", async () => {
    for (const reply of [
      { code: 255, stdout: "" },
      { code: 0, stdout: "not json" },
      { code: 0, stdout: '{"ok":false}' },
      { code: 0, stdout: '{"ok":true,"token":7}' },
    ])
      expect(
        await readEmailProof(email, after, env, async () => reply, now),
      ).toEqual({ ok: false });
  });

  it("quotes like shlex.quote", () => {
    expect(shellQuote("TAFF_RECIPIENT=a@b.test")).toBe(
      "TAFF_RECIPIENT=a@b.test",
    );
    expect(shellQuote("it's here")).toBe(`'it'"'"'s here'`);
  });
});

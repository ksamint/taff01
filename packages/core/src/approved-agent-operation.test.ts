import { createHash, createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyAgentOperation } from "./approved-agent-operation";
import { canonicalJson } from "./trusted-review";

const key = "isolated-agent-approval-secret-at-least-32-characters";
const tokenHash = createHash("sha256")
  .update("isolated-agent-token")
  .digest("hex");
function signed(overrides = {}) {
  const payload = {
    version: 1,
    audience: "taff_agent",
    issuer: "twin",
    source: "private_wechat",
    receipt_id: randomUUID(),
    controller_id: "robot:controller",
    workspace_id: randomUUID(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    tool: "tasks.edit",
    arguments: { taskId: randomUUID(), version: 1, title: "Reviewed edit" },
    expected_version: 1,
    credential_hash: tokenHash,
    ...overrides,
  };
  const receipt = {
    ...payload,
    operation_hash: createHash("sha256")
      .update(canonicalJson(payload))
      .digest("hex"),
  };
  return {
    receipt,
    signature: createHmac("sha256", key)
      .update(canonicalJson(receipt))
      .digest("hex"),
  };
}
describe("approved original-agent operations", () => {
  it("binds the original credential, target, arguments, version and audience", () => {
    const { receipt, signature } = signed();
    expect(verifyAgentOperation(receipt, signature, key, tokenHash)).toEqual(
      receipt,
    );
    expect(() =>
      verifyAgentOperation(receipt, signature, key, "0".repeat(64)),
    ).toThrow();
    for (const changes of [
      { expected_version: 2 },
      { controller_id: "other" },
      { arguments: { ...receipt.arguments, title: "Changed" } },
    ])
      expect(() =>
        verifyAgentOperation(
          { ...receipt, ...changes },
          signature,
          key,
          tokenHash,
        ),
      ).toThrow();
    for (const changes of [
      { audience: "taff" },
      { tool: "tasks.update" },
      { source: "group_wechat" },
    ]) {
      const bad = signed(changes);
      expect(() =>
        verifyAgentOperation(bad.receipt, bad.signature, key, tokenHash),
      ).toThrow();
    }
  });
});

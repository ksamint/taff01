import { createHash, createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyAgentOperation } from "./approved-agent-operation";

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
  const operation_json = JSON.stringify(payload);
  const receipt = {
    operation_json,
    operation_hash: createHash("sha256").update(operation_json).digest("hex"),
  };
  return {
    receipt,
    signature: createHmac("sha256", key).update(operation_json).digest("hex"),
  };
}
describe("approved original-agent operations", () => {
  it("verifies exact UTF-8 bytes without reserializing Unicode or integral floats", () => {
    const { receipt } = signed({
      arguments: {
        taskId: "11111111-1111-4111-8111-111111111111",
        version: 1,
        title: "确认 🗓️ 海报",
      },
    });
    const operation_json =
      receipt.operation_json.replace('"version":1', '"version":1.0') + " ";
    const envelope = {
      operation_json,
      operation_hash: createHash("sha256")
        .update(operation_json, "utf8")
        .digest("hex"),
    };
    const signature = createHmac("sha256", key)
      .update(operation_json, "utf8")
      .digest("hex");
    expect(
      verifyAgentOperation(envelope, signature, key, tokenHash).arguments.title,
    ).toBe("确认 🗓️ 海报");
    expect(() =>
      verifyAgentOperation(
        { ...envelope, operation_json: operation_json.trim() },
        signature,
        key,
        tokenHash,
      ),
    ).toThrow();
  });
  it("binds the original credential, target, arguments, version and audience", () => {
    const { receipt, signature } = signed();
    expect(verifyAgentOperation(receipt, signature, key, tokenHash)).toEqual({
      ...JSON.parse(receipt.operation_json),
      operation_hash: receipt.operation_hash,
    });
    expect(() =>
      verifyAgentOperation(receipt, signature, key, "0".repeat(64)),
    ).toThrow();
    for (const changes of [
      { expected_version: 2 },
      { controller_id: "other" },
      { arguments: { title: "Changed" } },
    ])
      expect(() =>
        verifyAgentOperation(
          {
            ...receipt,
            operation_json: JSON.stringify({
              ...JSON.parse(receipt.operation_json),
              ...changes,
            }),
          },
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

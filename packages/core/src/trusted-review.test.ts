import { createHash, createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, verifyReviewReceipt } from "./trusted-review";

const key = "isolated-test-key-at-least-thirty-two-characters";
export function signedReview(input: Record<string, unknown>) {
  const receipt = {
    ...input,
    operation_hash: createHash("sha256")
      .update(canonicalJson(input))
      .digest("hex"),
  };
  const signature = createHmac("sha256", key)
    .update(canonicalJson(receipt))
    .digest("hex");
  return { receipt, signature };
}
const operation = () => ({
  version: 1,
  audience: "taff",
  issuer: "twin",
  source: "private_wechat",
  receipt_id: randomUUID(),
  controller_id: "controller",
  workspace_id: randomUUID(),
  run_id: randomUUID(),
  expires_at: new Date(Date.now() + 60_000).toISOString(),
  review: {
    version: 1,
    decision: "approve",
    checks: {
      matchesDescription: true,
      verifiable: true,
      withinPermissions: true,
    },
    comment: "Verified",
    items: [
      { artifactId: randomUUID(), decision: "approve", comment: "Verified" },
    ],
  },
});
describe("trusted review signatures", () => {
  it("binds the complete human decision and canonicalizes key order", () => {
    const { receipt, signature } = signedReview(operation());
    expect(verifyReviewReceipt(receipt, signature, key)).toEqual(receipt);
    expect(canonicalJson({ b: 1, a: { z: 2, c: 3 } })).toBe(
      '{"a":{"c":3,"z":2},"b":1}',
    );
    for (const change of [
      { controller_id: "other" },
      { run_id: randomUUID() },
      { workspace_id: randomUUID() },
      { expires_at: new Date(0).toISOString() },
      {
        review: {
          ...operation().review,
          checks: {
            matchesDescription: false,
            verifiable: true,
            withinPermissions: true,
          },
        },
      },
    ]) {
      expect(() =>
        verifyReviewReceipt({ ...receipt, ...change }, signature, key),
      ).toThrow();
    }
    expect(() => verifyReviewReceipt(receipt, signature, "")).toThrow();
    expect(() => verifyReviewReceipt(receipt, "0".repeat(64), key)).toThrow();
  });
  it("rejects signed envelopes with wrong audience, group source, or operation hash", () => {
    for (const change of [
      { audience: "vash" },
      { source: "group_wechat" },
      { issuer: "agent" },
    ]) {
      const { receipt, signature } = signedReview({
        ...operation(),
        ...change,
      });
      expect(() => verifyReviewReceipt(receipt, signature, key)).toThrow();
    }
    const { receipt } = signedReview(operation());
    receipt.operation_hash = "0".repeat(64);
    const signature = createHmac("sha256", key)
      .update(canonicalJson(receipt))
      .digest("hex");
    expect(() => verifyReviewReceipt(receipt, signature, key)).toThrow();
  });
});

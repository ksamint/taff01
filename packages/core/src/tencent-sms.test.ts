import {
  authMethodsSchema,
  sendPhoneOtpSchema,
  verifyPhoneOtpSchema,
} from "@taff/schemas";
import { describe, expect, it, vi } from "vitest";
import {
  createTencentSmsProvider,
  tencentAuthorization,
  tencentSmsConfigFromEnv,
} from "./tencent-sms";

const config = {
  secretId: "test-id",
  secretKey: "test-secret",
  sdkAppId: "123",
  signName: "Test",
  templateId: "456",
  region: "ap-guangzhou",
};
describe("Tencent SMS signing and failure boundaries", () => {
  it("matches the signature in Tencent's published TC3 vector", () => {
    const authorization = tencentAuthorization({
      secretId: "example-secret-id",
      secretKey: "Gu5t9xGARNpq86cd98joQYCN3EXAMPLE",
      service: "cvm",
      host: "cvm.tencentcloudapi.com",
      timestamp: 1551113065,
      payload:
        '{"Limit": 1, "Filters": [{"Values": ["\\u672a\\u547d\\u540d"], "Name": "instance-name"}]}',
    });
    expect(authorization).toContain(
      "Signature=72e494ea809ad7a8c8f7a4507b9bddcbaa8e581f516e8da2f66e2c5a96525168",
    );
  });
  it("is disabled with no credentials even when the Compose region default is present", () => {
    expect(tencentSmsConfigFromEnv({})).toBeUndefined();
    expect(
      tencentSmsConfigFromEnv({ TENCENT_SMS_REGION: "ap-guangzhou" }),
    ).toBeUndefined();
    expect(() =>
      tencentSmsConfigFromEnv({ TENCENT_SECRET_KEY: "private-value" }),
    ).toThrow("Incomplete or invalid Tencent SMS configuration");
  });
  it("sends one OTP template parameter and does not retry an ambiguous timeout", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ Response: { SendStatusSet: [{ Code: "Ok" }] } }),
      );
    await createTencentSmsProvider(config, {
      fetch: transport,
      now: () => new Date("2026-10-09T00:00:00Z"),
    }).sendOTP({ phoneNumber: "+8613800000000", code: "012345" });
    expect(transport).toHaveBeenCalledTimes(1);
    const init = transport.mock.calls[0][1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      TemplateParamSet: ["012345"],
      PhoneNumberSet: ["+8613800000000"],
    });
    expect(init?.redirect).toBe("error");
    transport
      .mockClear()
      .mockRejectedValue(
        new Error("phone/code/secret private transport details"),
      );
    await expect(
      createTencentSmsProvider(config, { fetch: transport }).sendOTP({
        phoneNumber: "+8613800000000",
        code: "012345",
      }),
    ).rejects.toMatchObject({
      name: "SmsProviderError",
      message: "sms_unavailable",
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("suppresses provider error payloads and rejects invalid status shapes", async () => {
    for (const body of [
      { Response: { Error: { Message: "private phone" } } },
      { Response: { SendStatusSet: [{ Code: "LimitExceeded" }] } },
      null,
    ]) {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(body));
      await expect(
        createTencentSmsProvider(config, { fetch: transport }).sendOTP({
          phoneNumber: "+8613800000000",
          code: "123456",
        }),
      ).rejects.toThrow("sms_unavailable");
      expect(transport).toHaveBeenCalledTimes(1);
    }
  });
  it("uses strict mainland-only shared contracts", () => {
    expect(authMethodsSchema.parse({ smsEnabled: true })).toEqual({
      smsEnabled: true,
    });
    for (const phoneNumber of [
      "13800000000",
      "+85212345678",
      "+8612800000000",
      "+8613800000000 ",
    ])
      expect(sendPhoneOtpSchema.safeParse({ phoneNumber }).success).toBe(false);
    expect(
      verifyPhoneOtpSchema.safeParse({
        phoneNumber: "+8613800000000",
        code: "123456",
        disableSession: true,
      }).success,
    ).toBe(false);
  });
});

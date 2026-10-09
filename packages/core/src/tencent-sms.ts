import { createHash, createHmac } from "node:crypto";
import { mainlandPhoneSchema } from "@taff/schemas";

export type SmsProvider = {
  sendOTP(data: { phoneNumber: string; code: string }): Promise<void>;
};
export type TencentSmsConfig = {
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region: string;
};
export class SmsProviderError extends Error {
  constructor() {
    super("sms_unavailable");
    this.name = "SmsProviderError";
  }
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const hmac = (key: string | Buffer, value: string) =>
  createHmac("sha256", key).update(value).digest();
/** TC3 signature v3; the transmitted payload must match these exact bytes. */
export function tencentAuthorization(input: {
  secretId: string;
  secretKey: string;
  service: string;
  host: string;
  payload: string;
  timestamp: number;
}): string {
  const date = new Date(input.timestamp * 1000).toISOString().slice(0, 10);
  const headers = `content-type:application/json; charset=utf-8\nhost:${input.host}\n`;
  const signed = "content-type;host";
  const canonical = `POST\n/\n\n${headers}\n${signed}\n${hash(input.payload)}`;
  const scope = `${date}/${input.service}/tc3_request`;
  const toSign = `TC3-HMAC-SHA256\n${input.timestamp}\n${scope}\n${hash(canonical)}`;
  const dateKey = hmac(`TC3${input.secretKey}`, date);
  const serviceKey = hmac(dateKey, input.service);
  const signingKey = hmac(serviceKey, "tc3_request");
  const signature = hmac(signingKey, toSign).toString("hex");
  return `TC3-HMAC-SHA256 Credential=${input.secretId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
}
/** Empty configuration disables SMS. A partial configuration fails closed. */
export function tencentSmsConfigFromEnv(
  env: Record<string, string | undefined>,
): TencentSmsConfig | undefined {
  const names = [
    "TENCENT_SECRET_ID",
    "TENCENT_SECRET_KEY",
    "TENCENT_SMS_SDK_APP_ID",
    "TENCENT_SMS_SIGN_NAME",
    "TENCENT_SMS_TEMPLATE_ID",
  ] as const;
  const values = names.map((name) => env[name]?.trim() ?? "");
  if (!values.some(Boolean)) return undefined;
  if (
    values.some((value) => !value) ||
    !/^\d+$/.test(values[2]) ||
    !/^\d+$/.test(values[4]) ||
    !/^[a-z]+-[a-z]+(?:-\d+)?$/.test(
      env.TENCENT_SMS_REGION?.trim() || "ap-guangzhou",
    )
  )
    throw new Error("Incomplete or invalid Tencent SMS configuration");
  return {
    secretId: values[0],
    secretKey: values[1],
    sdkAppId: values[2],
    signName: values[3],
    templateId: values[4],
    region: env.TENCENT_SMS_REGION?.trim() || "ap-guangzhou",
  };
}
export function createTencentSmsProvider(
  config: TencentSmsConfig,
  dependencies: { fetch?: typeof fetch; now?: () => Date } = {},
): SmsProvider {
  const request = dependencies.fetch ?? fetch;
  return {
    async sendOTP({ phoneNumber, code }) {
      if (
        !mainlandPhoneSchema.safeParse(phoneNumber).success ||
        !/^\d{6}$/.test(code)
      )
        throw new SmsProviderError();
      const payload = JSON.stringify({
        PhoneNumberSet: [phoneNumber],
        SmsSdkAppId: config.sdkAppId,
        SignName: config.signName,
        TemplateId: config.templateId,
        TemplateParamSet: [code],
      });
      const timestamp = Math.floor(
        (dependencies.now?.() ?? new Date()).getTime() / 1000,
      );
      try {
        // One attempt: a timeout may mean Tencent accepted the message.
        const response = await request("https://sms.tencentcloudapi.com/", {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(10_000),
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Host: "sms.tencentcloudapi.com",
            "X-TC-Action": "SendSms",
            "X-TC-Version": "2021-01-11",
            "X-TC-Region": config.region,
            "X-TC-Timestamp": String(timestamp),
            Authorization: tencentAuthorization({
              ...config,
              service: "sms",
              host: "sms.tencentcloudapi.com",
              payload,
              timestamp,
            }),
          },
          body: payload,
        });
        if (!response.ok) throw new SmsProviderError();
        const body: unknown = await response.json();
        const result = body as {
          Response?: { Error?: unknown; SendStatusSet?: { Code?: unknown }[] };
        };
        if (
          result?.Response?.Error ||
          result?.Response?.SendStatusSet?.length !== 1 ||
          result.Response.SendStatusSet[0]?.Code !== "Ok"
        )
          throw new SmsProviderError();
      } catch {
        // Provider messages can repeat phone numbers, codes and request identifiers.
        throw new SmsProviderError();
      }
    },
  };
}
export function createTencentSmsProviderFromEnv(
  env: Record<string, string | undefined>,
): SmsProvider | undefined {
  const config = tencentSmsConfigFromEnv(env);
  return config ? createTencentSmsProvider(config) : undefined;
}

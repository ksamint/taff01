import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmailTransportFromEnv,
  createLoggingEmailTransport,
  deliverEmail,
} from "./email";

import { emailMessage, emailResources } from "./email-messages";

const smtp = vi.hoisted(() => ({
  sendMail: vi.fn(),
  close: vi.fn(),
  createTransport: vi.fn(),
}));
vi.mock("nodemailer", () => ({
  default: { createTransport: smtp.createTransport },
}));
const message = {
  to: "fixture@example.test",
  subject: "Fixture",
  text: "Private fixture link",
};
const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
  vi.clearAllMocks();
});
async function privatePath() {
  const directory = await mkdtemp(join(tmpdir(), "taff-mail-test-"));
  directories.push(directory);
  await chmod(directory, 0o700);
  return join(directory, "messages.jsonl");
}
describe("private outgoing email boundary", () => {
  it("logs unset SMTP with harmless defaults to a private regular file, never stdout", async () => {
    const path = await privatePath();
    const transport = createEmailTransportFromEnv({
      EMAIL_PORT: "465",
      EMAIL_SECURE: "true",
      EMAIL_LOG_PATH: path,
    });
    const status = vi.fn();
    expect(await deliverEmail(transport, "verification", message, status)).toBe(
      "logged",
    );
    expect(status).toHaveBeenCalledExactlyOnceWith({
      kind: "verification",
      delivery: "logged",
    });
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    const row = JSON.parse(await readFile(path, "utf8"));
    expect(row).toMatchObject(message);
    expect(smtp.createTransport).not.toHaveBeenCalled();
  });
  it("rejects symlink files and non-private existing permissions without changing them", async () => {
    const path = await privatePath();
    const linked = `${path}.real`;
    await writeFile(linked, "original", { mode: 0o600 });
    await symlink(linked, path);
    expect(
      await deliverEmail(
        createLoggingEmailTransport(path),
        "invitation",
        message,
      ),
    ).toBe("failed");
    expect(await readFile(linked, "utf8")).toBe("original");
    await rm(path);
    await writeFile(path, "original", { mode: 0o644 });
    expect(
      await deliverEmail(
        createLoggingEmailTransport(path),
        "verification",
        message,
      ),
    ).toBe("failed");
    expect((await lstat(path)).mode & 0o777).toBe(0o644);
    expect(await readFile(path, "utf8")).toBe("original");
  });
  it("rejects symlink directories and nonregular destinations", async () => {
    const path = await privatePath();
    const directory = join(path, "..");
    const link = `${directory}-link`;
    directories.push(link);
    await symlink(directory, link);
    expect(
      await deliverEmail(
        createLoggingEmailTransport(join(link, "other.jsonl")),
        "verification",
        message,
      ),
    ).toBe("failed");
    expect(
      await deliverEmail(
        createLoggingEmailTransport(directory),
        "verification",
        message,
      ),
    ).toBe("failed");
  });
  it("validates all-or-none configuration and SMTP TLS without exposing config values", async () => {
    expect(() =>
      createEmailTransportFromEnv({ EMAIL_HOST: "smtp.example.test" }),
    ).toThrow("Invalid email configuration");
    smtp.createTransport.mockReturnValue(smtp);
    const config = {
      EMAIL_HOST: "smtp.example.test",
      EMAIL_USER: "fixture-user",
      EMAIL_PASSWORD: "fixture-password",
      EMAIL_FROM: "sender@example.test",
      EMAIL_PORT: "587",
      EMAIL_SECURE: "false",
    };
    createEmailTransportFromEnv(config);
    expect(smtp.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 587,
        secure: false,
        requireTLS: true,
        tls: { rejectUnauthorized: true },
        logger: false,
        debug: false,
      }),
    );
    expect(() =>
      createEmailTransportFromEnv({
        ...config,
        EMAIL_FROM: "sender@example.test\r\nBcc: other@example.test",
      }),
    ).toThrow("Invalid email configuration");
    expect(() =>
      createEmailTransportFromEnv({ ...config, EMAIL_SECURE: "yes" }),
    ).toThrow("Invalid email configuration");
  });
  it("does not retry or log provider exceptions on ambiguous SMTP failure", async () => {
    smtp.createTransport.mockReturnValue(smtp);
    smtp.sendMail.mockRejectedValue(new Error("Sensitive provider response"));
    const transport = createEmailTransportFromEnv({
      EMAIL_HOST: "smtp.example.test",
      EMAIL_USER: "fixture-user",
      EMAIL_PASSWORD: "fixture-password",
      EMAIL_FROM: "sender@example.test",
    });
    const status = vi.fn();
    expect(await deliverEmail(transport, "invitation", message, status)).toBe(
      "failed",
    );
    expect(smtp.sendMail).toHaveBeenCalledTimes(1);
    expect(status.mock.calls).toEqual([
      [{ kind: "invitation", delivery: "failed" }],
    ]);
    await transport.close?.();
    expect(smtp.close).toHaveBeenCalledOnce();
  });
});

describe("recipient-localized server email", () => {
  it("resolves all three resource sets through an isolated i18next instance without link escaping or language races", async () => {
    const link = "https://taff.example.test/#verifyEmail=a.b_c-def";
    const locales = ["en", "zh-CN", "zh-HK"] as const;
    const messages = await Promise.all(
      locales.map(async (locale) => emailMessage("verification", locale, link)),
    );
    for (const [index, locale] of locales.entries()) {
      expect(messages[index].subject).toBe(
        emailResources[locale].emailVerificationSubject,
      );
      expect(messages[index].text).toContain(`\n${link}\n`);
      expect(messages[index].text).not.toContain("{{link}}");
      expect(emailMessage("invitation", locale, link).subject).toBe(
        emailResources[locale].emailInvitationSubject,
      );
    }
    expect(emailMessage("invitation", "unsupported", link)).toEqual(
      emailMessage("invitation", "en", link),
    );
  });
});

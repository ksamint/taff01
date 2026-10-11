import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { EmailDelivery } from "@taff/schemas";
import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
};
export type EmailTransport = {
  send(message: EmailMessage): Promise<"sent" | "logged">;
  close?(): void | Promise<void>;
};
export type EmailStatus = {
  kind: "invitation" | "verification";
  delivery: EmailDelivery;
};

/** No provider details, recipients, links or credentials leave this boundary. */
export async function deliverEmail(
  transport: EmailTransport | undefined,
  kind: EmailStatus["kind"],
  message: EmailMessage,
  onStatus?: (status: EmailStatus) => void,
): Promise<EmailDelivery> {
  let delivery: EmailDelivery = "failed";
  try {
    if (transport) delivery = await transport.send(message);
  } catch {
    // A failed or ambiguous send is never retried or silently redirected.
  }
  try {
    onStatus?.({ kind, delivery });
  } catch {
    // Observability cannot turn a committed invitation into a failed request.
  }
  return delivery;
}

function privateNode(
  info: Awaited<ReturnType<typeof lstat>>,
  directory: boolean,
) {
  const mode = directory ? 0o700 : 0o600;
  if (
    info.isSymbolicLink() ||
    !(directory ? info.isDirectory() : info.isFile()) ||
    (Number(info.mode) & 0o777) !== mode ||
    (process.getuid && info.uid !== process.getuid()) ||
    (!directory && info.nlink !== 1)
  )
    throw new Error("Email log unavailable");
}

/** Deliberately private mailbox for deployments without SMTP; never stdout. */
export function createLoggingEmailTransport(path: string): EmailTransport {
  const target = resolve(path);
  const directory = dirname(target);
  return {
    async send(message) {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      privateNode(await lstat(directory), true);
      // Reject symlinks and special files before opening (FIFO open may block).
      try {
        privateNode(await lstat(target), false);
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw new Error("Email log unavailable");
      }
      const handle = await open(
        target,
        constants.O_APPEND |
          constants.O_CREAT |
          constants.O_WRONLY |
          constants.O_NOFOLLOW |
          constants.O_NONBLOCK,
        0o600,
      );
      try {
        privateNode(await handle.stat(), false);
        await handle.writeFile(
          `${JSON.stringify({ createdAt: new Date().toISOString(), ...message })}\n`,
          "utf8",
        );
      } finally {
        await handle.close();
      }
      return "logged";
    },
  };
}

/** SMTP is all-or-none; default port/secure values do not enable it. */
export function createEmailTransportFromEnv(
  env: Record<string, string | undefined>,
): EmailTransport {
  const fields = [
    "EMAIL_HOST",
    "EMAIL_USER",
    "EMAIL_PASSWORD",
    "EMAIL_FROM",
  ] as const;
  const values = fields.map((key) =>
    key === "EMAIL_PASSWORD" ? (env[key] ?? "") : (env[key]?.trim() ?? ""),
  );
  if (!values.some((value) => value.trim().length > 0))
    return createLoggingEmailTransport(
      env.EMAIL_LOG_PATH?.trim() || ".taff-mail/messages.jsonl",
    );
  if (!values.every((value) => value.trim().length > 0))
    throw new Error("Invalid email configuration");
  const portText = env.EMAIL_PORT?.trim() || "465";
  const secureText = env.EMAIL_SECURE?.trim() || "true";
  const port = Number(portText);
  if (
    !/^\d+$/.test(portText) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !["true", "false"].includes(secureText)
  )
    throw new Error("Invalid email configuration");
  const [host, username, password, from] = values;
  if (/[\r\n]/.test(host + from) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))
    throw new Error("Invalid email configuration");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: secureText === "true",
    requireTLS: secureText !== "true",
    auth: { user: username, pass: password },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    logger: false,
    debug: false,
  });
  return {
    async send(message) {
      const result = await transport.sendMail({ from, ...message });
      // SMTP acceptance is reported honestly; it is not inbox delivery proof.
      if (!result.accepted?.length || result.rejected?.length)
        throw new Error("Email delivery failed");
      return "sent";
    },
    close: () => transport.close(),
  };
}

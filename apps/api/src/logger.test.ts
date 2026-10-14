import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";

const KEY = "sk-live-never-in-logs-0123456789";
function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { logger: createLogger(stream), lines };
}

describe("API logger redaction (ADR 0016)", () => {
  it("never writes the model key, tokens or credentials", () => {
    const { logger, lines } = capture();
    logger.info({ apiKey: KEY }, "top level");
    logger.info({ config: { apiKey: KEY, model: "m" } }, "nested");
    logger.info({ AI_API_KEY: KEY }, "env name");
    logger.info({ env: { AI_API_KEY: KEY } }, "env object");
    logger.info({ headers: { authorization: `Bearer ${KEY}` } }, "headers");
    logger.info(
      { request: { headers: { authorization: `Bearer ${KEY}` } } },
      "request",
    );
    logger.info(
      { req: { headers: { authorization: `Bearer ${KEY}`, cookie: KEY } } },
      "pino request",
    );
    logger.info({ token: KEY, password: KEY }, "credentials");
    expect(lines).toHaveLength(8);
    for (const line of lines) expect(line).not.toContain(KEY);
    expect(lines[1]).toContain('"model":"m"');
    expect(lines.join("")).toContain("[Redacted]");
  });
});

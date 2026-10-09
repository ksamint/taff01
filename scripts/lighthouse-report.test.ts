import { describe, expect, it } from "vitest";
import { lighthouseReport } from "./lighthouse-report";

describe("uploadable Lighthouse reports", () => {
  it("removes transport headers and credentials while retaining audit results", () => {
    const report = lighthouseReport(
      {
        categories: { performance: { score: 0.95 } },
        configSettings: { extraHeaders: { Cookie: "session-value" } },
        audits: {
          network: {
            details: {
              requestHeaders: { Authorization: "Bearer private-token" },
              responseHeaders: { "Set-Cookie": "renewed-session" },
              url: "http://localhost/?value=private%2Ftoken",
              description: 'secret "quoted"',
            },
          },
        },
      },
      ["private/token", 'secret "quoted"'],
    );
    expect(JSON.parse(report)).toEqual({
      categories: { performance: { score: 0.95 } },
      configSettings: {},
      audits: {
        network: {
          details: {
            url: "http://localhost/?value=[redacted]",
            description: "[redacted]",
          },
        },
      },
    });
    expect(report).not.toMatch(/session-value|private-token|renewed-session/);
  });
});

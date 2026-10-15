import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";

describe("shared-host neighbour preservation", () => {
  it("distinguishes independent rollouts, Taff effects and unexplained drift", () => {
    execFileSync(
      "python3",
      ["-m", "unittest", "discover", "-s", "scripts/deploy", "-p", "test_*.py"],
      { stdio: "pipe" },
    );
  });
});

import { expect, it } from "vitest";
import { setLocalTestSystemAdmin } from "./system-admin";

it("refuses nonlocal database fixtures before connecting", async () => {
  await expect(
    setLocalTestSystemAdmin(
      "postgres://unused@production.example/taff",
      "unused",
      true,
    ),
  ).rejects.toThrow("loopback database");
});

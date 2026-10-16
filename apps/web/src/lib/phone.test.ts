import { expect, it } from "vitest";
import { mainlandPhone } from "./phone";

it("recognizes mainland mobile numbers typed in the sign-in field", () => {
  expect(mainlandPhone("13800138000")).toBe("+8613800138000");
  expect(mainlandPhone("138 0013 8000")).toBe("+8613800138000");
  expect(mainlandPhone("+86 138-0013-8000")).toBe("+8613800138000");
  expect(mainlandPhone("8613800138000")).toBe("+8613800138000");
});

it("leaves emails, usernames and other numbers to password sign-in", () => {
  expect(mainlandPhone("mei@example.com")).toBeNull();
  expect(mainlandPhone("mei_chan")).toBeNull();
  expect(mainlandPhone("12800138000")).toBeNull();
  expect(mainlandPhone("1380013800")).toBeNull();
  expect(mainlandPhone("+85291234567")).toBeNull();
  expect(mainlandPhone("")).toBeNull();
});

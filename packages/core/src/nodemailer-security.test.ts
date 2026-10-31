import addressparser from "nodemailer/lib/addressparser";
import { expect, it } from "vitest";

it.each<[string, string, unknown]>([
  [
    "GHSA-8c8m-p3m8-cjg8",
    "Victim (x(y) <evil@evil.com>) <v@victim.com>",
    [{ address: "v@victim.com", name: "Victim" }],
  ],
  [
    "GHSA-m943-m63m-w62w",
    "G: (a; <evil@evil.com>) <v@victim.com>;",
    [
      {
        name: "G",
        group: [{ address: "v@victim.com", name: "a; <evil@evil.com>" }],
      },
    ],
  ],
  [
    "GHSA-85x2-q946-cp5h",
    '<"a@evil.com>"@good.com>',
    [{ address: '"a@evil.com>"@good.com', name: "" }],
  ],
])("keeps the intended recipient for %s", (_advisory, input, expected) => {
  expect(addressparser(input)).toEqual(expected);
});

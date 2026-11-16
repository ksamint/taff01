import { expect, type Request, test } from "@playwright/test";
import { meSchema } from "../packages/schemas/src/index";
import { demoSession } from "./support/demo-session";

test("demo session reuses the same user in a fresh context without another sign-in", async ({
  page,
  browser,
}) => {
  let signIns = 0;
  const countSignIn = (request: Request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/auth/sign-in/email"
    )
      signIns++;
  };
  page.context().on("request", countSignIn);
  await demoSession(page);
  const firstResponse = await page.request.get("/api/me");
  expect(firstResponse.status()).toBe(200);
  const first = meSchema.parse(await firstResponse.json());
  const afterFirst = signIns;
  const secondContext = await browser.newContext({
    baseURL: process.env.AUTH_URL,
  });
  try {
    secondContext.on("request", countSignIn);
    const secondPage = await secondContext.newPage();
    await demoSession(secondPage);
    const secondResponse = await secondPage.request.get("/api/me");
    expect(secondResponse.status()).toBe(200);
    const second = meSchema.parse(await secondResponse.json());
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.email).toBe(first.user.email);
    expect(signIns).toBe(afterFirst);
  } finally {
    await secondContext.close();
  }
});

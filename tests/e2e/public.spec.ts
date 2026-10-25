import { test, expect } from "@playwright/test";
test("landing page and secure request entry", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Home repairs, on the same page." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Describe your repair" }),
  ).toBeVisible();
  await expect(page.getByText("No surprise charges")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `tmp/screenshots/${info.project.name}-home.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Describe your repair" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `tmp/screenshots/${info.project.name}-login.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("language switch and keyboard navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(
    page.getByRole("heading", { name: "घर की मरम्मत, पूरी सहमति से।" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
test("commands reject cross-origin and unauthenticated requests", async ({
  request,
}) => {
  const body = { action: "create", key: crypto.randomUUID(), payload: {} };
  const denied = await request.post("/api/command", {
    data: body,
    headers: { Origin: "https://untrusted.invalid" },
  });
  expect(denied.status()).toBe(403);
  const unsigned = await request.post("/api/command", {
    data: body,
    headers: { Origin: "http://localhost:3000" },
  });
  expect(unsigned.status()).toBe(401);
});

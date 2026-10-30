import { expect, test } from "@playwright/test";

test("explorer loads places, searches, and opens a detail panel", async ({ page }) => {
  await page.goto("/");
  const search = page.getByLabel("Search places").locator("visible=true");
  await expect(search).toBeVisible();
  await expect(page.getByText(/\d+ shown/).locator("visible=true")).toBeVisible({ timeout: 20_000 });
  await search.fill("smuggler");
  const card = page.getByRole("button", { name: /Smuggler's Cove/ }).locator("visible=true").first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/p=smugglers-cove-san-francisco/);
  await expect(page.getByRole("heading", { name: "Smuggler's Cove" }).locator("visible=true")).toBeVisible();
  await expect(page.getByText("Where this comes from").locator("visible=true")).toBeVisible();
});

test("place page renders hours and sources", async ({ page }) => {
  await page.goto("/places/smugglers-cove-san-francisco");
  await expect(page.getByRole("heading", { level: 1, name: "Smuggler's Cove" })).toBeVisible();
  await expect(page.getByText("650 Gough St")).toBeVisible();
  await expect(page.getByText("Hours")).toBeVisible();
  await expect(page.getByText("Where this comes from")).toBeVisible();
});

test("sources and submit pages render", async ({ page }) => {
  await page.goto("/sources");
  await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  await expect(page.getByRole("table").getByRole("link", { name: "Tiki Rat" })).toBeVisible();
  await page.goto("/submit");
  await expect(page.getByLabel("Bar name")).toBeVisible();
});

import { expect, test } from "@playwright/test";

test("explorer loads places, searches, and opens a detail panel", async ({ page }) => {
  await page.goto("/?view=false");
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

test("in view toggle starts on and round-trips through the URL", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "In view" }).locator("visible=true");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page).toHaveURL(/view=false/);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page).not.toHaveURL(/view=/);
});

test("in view limits the list to the map frame", async ({ page }) => {
  const card = page.getByRole("button", { name: /Smuggler's Cove/ }).locator("visible=true").first();

  await page.goto("/?c=37.77,-122.42,12&q=smuggler");
  await expect(card).toBeVisible({ timeout: 20_000 });

  await page.goto("/?c=40.7,-74,12&q=smuggler");
  const showOutside = page.getByRole("button", { name: /Show \d+ outside the map/ }).locator("visible=true");
  await expect(showOutside).toBeVisible({ timeout: 20_000 });
  await expect(card).toBeHidden();
  await showOutside.click();
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(/view=false/);
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

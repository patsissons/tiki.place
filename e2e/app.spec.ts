import { expect, test } from "@playwright/test";

test("renders the explorer shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /find the nearest bamboo-lit pour/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /search & filter/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /submit a bar/i })).toBeVisible();
});

test("opens the filter sheet", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /search & filter/i }).click();
  await expect(page.getByRole("heading", { name: /dial in the map/i })).toBeVisible();
  const searchInput = page.getByLabel(/name search/i);
  await searchInput.fill("smuggler");
  await expect(searchInput).toHaveValue("smuggler");
});

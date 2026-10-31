import { expect, test } from "@playwright/test";
import { SITE } from "../lib/seo";

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

test("the sky renders behind the globe and can be switched off", async ({ page }) => {
  await page.goto("/");
  const backdrop = page.getByTestId("space-backdrop");
  await expect(backdrop).toBeAttached();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  await expect(backdrop).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  expect(await page.locator("canvas").count()).toBe(2);

  await page.goto("/?sky=0");
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("space-backdrop")).toHaveAttribute("data-state", "idle");
  expect(await page.locator("canvas").count()).toBe(1);
});

test("the options sheet sets the sky mode and remembers it", async ({ page }) => {
  await page.goto("/");
  const backdrop = page.getByTestId("space-backdrop");
  await expect(backdrop).toHaveAttribute("data-state", "ready", { timeout: 30_000 });

  await page.getByRole("button", { name: "Options" }).click();
  const dialog = page.getByRole("dialog", { name: "Options" });
  await expect(dialog.getByRole("radio", { name: "Accelerated" })).toBeChecked();
  await dialog.getByRole("radio", { name: "None" }).click();
  await expect(backdrop).toHaveAttribute("data-state", "idle");
  expect(await page.locator("canvas").count()).toBe(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The choice survives a reload without any URL flag.
  await page.reload();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("space-backdrop")).toHaveAttribute("data-state", "idle");

  await page.getByRole("button", { name: "Options" }).click();
  await expect(page.getByRole("radio", { name: "None" })).toBeChecked();
  await page.getByRole("radio", { name: "Real time" }).click();
  await expect(page.getByTestId("space-backdrop")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
});

test("music waits for a gesture, follows focus, and the toggle turns it off and remembers", async ({ page }) => {
  // Only iOS honours the session type, so stand in for it where the browser has none.
  await page.addInitScript(() => {
    if (!("audioSession" in navigator)) Object.defineProperty(navigator, "audioSession", { value: { type: "auto" } });
  });
  const sessionType = () => page.evaluate(() => (navigator as Navigator & { audioSession: { type: string } }).audioSession.type);
  const fetched: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/music/")) fetched.push(r.url());
  });
  const music = page.getByTestId("background-music");
  const search = page.getByLabel("Search places").locator("visible=true");

  await page.goto("/");
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  await expect(music).toHaveAttribute("data-state", "idle");
  expect(fetched).toEqual([]);

  await search.click();
  await expect(music).toHaveAttribute("data-state", "playing", { timeout: 20_000 });
  expect(fetched).toHaveLength(2);
  expect(await sessionType()).toBe("playback");

  await page.evaluate(() => {
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
  });
  await expect(music).toHaveAttribute("data-state", "paused");
  expect(await sessionType()).toBe("auto");
  await page.evaluate(() => {
    document.hasFocus = () => true;
    window.dispatchEvent(new Event("focus"));
  });
  await expect(music).toHaveAttribute("data-state", "playing");

  await page.getByRole("button", { name: "Turn music off" }).click();
  await expect(music).toHaveAttribute("data-state", "paused");
  expect(await sessionType()).toBe("auto");

  // Off survives a reload: a gesture no longer starts anything or fetches the loops.
  fetched.length = 0;
  await page.reload();
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  await search.click();
  await page.waitForTimeout(1_000);
  await expect(music).toHaveAttribute("data-state", "idle");
  expect(fetched).toEqual([]);

  await page.getByRole("button", { name: "Turn music on" }).click();
  await search.click();
  await expect(music).toHaveAttribute("data-state", "playing", { timeout: 20_000 });
});

test("turning the music off as the first gesture never downloads it", async ({ page }) => {
  const fetched: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/music/")) fetched.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator(".mapboxgl-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Turn music off" }).click();
  await expect(page.getByRole("button", { name: "Turn music on" })).toBeVisible();
  await page.waitForTimeout(1_000);
  expect(fetched).toEqual([]);
});

test("pages carry complete social metadata and generated images", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "metadata is identical across viewports");
  const meta = (selector: string) => page.locator(selector).first().getAttribute("content");
  // og:image is absolute against metadataBase (the production origin), so fetch its path locally.
  const local = (url: string) => new URL(url).pathname + new URL(url).search;

  await page.goto("/places/smugglers-cove-san-francisco");
  expect(await meta('meta[property="og:site_name"]')).toBe(SITE.name);
  expect(await meta('meta[property="og:title"]')).toContain("Smuggler's Cove");
  expect(await meta('meta[property="og:description"]')).toContain("San Francisco");
  expect(await meta('meta[property="og:url"]')).toMatch(/^https?:\/\/.+\/places\/smugglers-cove-san-francisco$/);
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  // Files inside the (site) route group get a hashed suffix, so match loosely.
  const placeImage = await meta('meta[property="og:image"]');
  expect(placeImage).toMatch(/\/places\/smugglers-cove-san-francisco\/opengraph-image(-[0-9a-z]+)?(\?|$)/);
  const placePng = await request.get(local(placeImage!));
  expect(placePng.status()).toBe(200);
  expect(placePng.headers()["content-type"]).toBe("image/png");
  expect((await placePng.body()).length).toBeGreaterThan(10_000);

  await page.goto("/");
  expect(await meta('meta[property="og:site_name"]')).toBe(SITE.name);
  const siteImage = await meta('meta[property="og:image"]');
  expect(siteImage).toMatch(/\/opengraph-image(\?|$)/);
  expect((await request.get(local(siteImage!))).headers()["content-type"]).toBe("image/png");
  const icon = await page.locator('link[rel="icon"][sizes="32x32"]').getAttribute("href");
  expect((await request.get(icon!)).headers()["content-type"]).toBe("image/png");
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(appleIcon!)).headers()["content-type"]).toBe("image/png");
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).name).toBe(SITE.name);
});

test("agents can find the dataset and read status and hours", async ({ page, request, isMobile }) => {
  test.skip(isMobile, "machine-readable output is identical across viewports");
  const llms = await request.get("/llms.txt");
  expect(llms.headers()["content-type"]).toContain("text/plain");
  expect(await llms.text()).toMatch(/\(https?:\S+\/data\/places\.json\)/);
  const places = await request.get("/data/places.json");
  const record = ((await places.json()) as { id: string; status: string }[]).find((p) => p.id === "smugglers-cove-san-francisco");
  expect(record?.status).toBe("open");

  await page.goto("/places/smugglers-cove-san-francisco");
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(ld.additionalProperty.value).toBe("open");
  expect(ld.openingHoursSpecification.length).toBeGreaterThan(0);

  await page.goto("/about");
  await expect(page.getByRole("link", { name: "llms.txt" })).toHaveAttribute("href", "/llms.txt");
});

test("share copies the permalink from the explorer", async ({ page, context, isMobile }) => {
  test.skip(isMobile, "clipboard permissions are Chromium-only");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // Force the clipboard path: desktop Chrome on macOS has a native share sheet that would hang headless.
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.goto("/?p=smugglers-cove-san-francisco&view=false");
  const share = page.getByRole("button", { name: "Share" }).locator("visible=true");
  await expect(share).toBeVisible({ timeout: 20_000 });
  await share.click();
  await expect(page.getByRole("button", { name: "Copied" }).locator("visible=true")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("http://localhost:3000/places/smugglers-cove-san-francisco");
});

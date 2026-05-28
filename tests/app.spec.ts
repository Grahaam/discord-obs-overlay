import { test, expect } from "@playwright/test";

// Skip tutorial on every page load (it shows when hasSeenTutorial not in localStorage)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("hasSeenTutorial", "true");
  });
});

test.describe("Dashboard", () => {
  test("renders at /", async ({ page }) => {
    await page.goto("/");
    // Tab bar must be present — tests lucide-react icon imports didn't break
    await expect(page.getByRole("button", { name: "Bot Discord" })).toBeVisible();
  });

  test("has all 5 tabs", async ({ page }) => {
    await page.goto("/");
    for (const label of ["Bot Discord", "Look OBS", "Filtres & Modération", "Simulateur", "Santé du Système"]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
  });

  test("switching to Look OBS tab shows style options", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Look OBS" }).click();
    // Styling panel shows visual theme options (neon/glitch/cyberpunk/glass)
    await expect(page.getByText(/neon|néon/i).first()).toBeVisible();
  });
});

test.describe("Overlay", () => {
  test("renders at /overlay without crash", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto("/overlay");
    await page.waitForTimeout(500);
    expect(errors).toHaveLength(0);
  });
});

test.describe("API", () => {
  test("GET /api/settings returns 200 with masked token", async ({ request }) => {
    const res = await request.get("/api/settings");
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Token must never be raw — either empty or masked
    expect(body.discordToken).not.toMatch(/^[A-Za-z0-9._-]{50,}$/);
  });

  test("POST /api/trigger-test without body returns 200", async ({ request }) => {
    const res = await request.post("/api/trigger-test");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.payload.isTest).toBe(true);
  });

  test("POST /api/trigger-test with custom body returns correct payload", async ({ request }) => {
    const res = await request.post("/api/trigger-test", {
      headers: { "Content-Type": "application/json" },
      data: { authorName: "TestUser", text: "hello" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.payload.authorName).toBe("TestUser");
    expect(body.payload.text).toBe("hello");
  });

  test("GET /api/logs returns array", async ({ request }) => {
    const res = await request.get("/api/logs");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /api/bot-status returns 200", async ({ request }) => {
    const res = await request.get("/api/bot-status");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status");
  });
});

import { test, expect, type APIRequestContext } from "@playwright/test";

// 1×1 PNG: a local data URI skips the network media resolver
const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const simulate = (request: APIRequestContext, id: string, authorName: string) =>
  request.post("/api/trigger-test", {
    data: { authorName, text: `hello from ${authorName}`, mediaUrl: PIXEL, asPoster: { id, roleIds: [] } },
  });

// Runs against the dev server's real data folder: put the settings back as they were
let original: Record<string, unknown>;
test.beforeAll(async ({ request }) => {
  original = await (await request.get("/api/settings")).json();
  const res = await request.post("/api/settings", {
    data: { ...original, approvalMode: "new", approvalNewPosterCount: 1, approvalTrustedRoleIds: [] },
  });
  expect(res.ok()).toBe(true);
});
test.afterAll(async ({ request }) => {
  await request.post("/api/settings", { data: original });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("hasSeenTutorial", "true"));
});

test.describe("Approval inbox", () => {
  test("an unapproved poster is held, then approved from the inbox", async ({ page, request }) => {
    const author = `Newbie-${Date.now()}`;
    await page.goto("/");
    const inbox = page.getByRole("region", { name: /À valider/ });
    await expect(inbox).toBeVisible();

    const res = await simulate(request, `e2e-approve-${Date.now()}`, author);
    expect((await res.json()).outcome).toBe("held");

    const item = inbox.getByTestId("approval-item").filter({ hasText: author });
    await expect(item).toBeVisible();
    await expect(item.getByText("hello from " + author)).toBeVisible();
    await expect(page.getByTestId("nav-badge-live")).toBeVisible();

    // Held alerts stay out of the queue until approved
    expect(await (await request.get("/api/approvals")).json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ alert: expect.objectContaining({ authorName: author }) })])
    );

    await item.getByRole("button", { name: "Approuver", exact: true }).click();
    await expect(item).toBeHidden();
    await expect(page.getByRole("list", { name: /File d’attente/ }).getByText(author, { exact: true })).toBeVisible();
  });

  test("reject drops the alert and logs it", async ({ page, request }) => {
    const author = `Troll-${Date.now()}`;
    await page.goto("/");
    await expect(page.getByTestId("approval-count")).toBeVisible();
    await simulate(request, `e2e-reject-${Date.now()}`, author);

    const item = page.getByTestId("approval-item").filter({ hasText: author });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Refuser" }).click();
    await expect(item).toBeHidden();

    const logs = (await (await request.get("/api/logs")).json()) as {
      author: string;
      status: string;
      reason: string;
    }[];
    expect(logs.find((l) => l.author === author)).toMatchObject({
      status: "blocked",
      reason: "Refusé par le streamer",
    });
  });

  test("“always approve” trusts the poster for their next alerts", async ({ page, request }) => {
    const id = `e2e-always-${Date.now()}`;
    const author = `Regular-${Date.now()}`;
    await page.goto("/");
    await expect(page.getByTestId("approval-count")).toBeVisible();
    await simulate(request, id, author);

    const item = page.getByTestId("approval-item").filter({ hasText: author });
    await item.getByRole("button", { name: "Toujours approuver cette personne" }).click();
    await expect(item).toBeHidden();

    const again = await (await simulate(request, id, author)).json();
    expect(again.outcome).toBe("delivered");
  });
});

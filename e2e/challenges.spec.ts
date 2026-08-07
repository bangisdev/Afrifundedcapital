import { test, expect } from "@playwright/test";
import { createDemoPurchase, ensureSeeded, signInAdminFast } from "./helpers";

// ═══════════════════════════════════════════════════════════════
// 4. Challenges — templates, demo purchase, and the user challenge list
// ═══════════════════════════════════════════════════════════════
test.describe("4. Challenges", () => {
  test.beforeAll(async ({ request }) => {
    await ensureSeeded(request);
  });

  test("the public templates API exposes all seeded challenge types", async ({ request }) => {
    const res = await request.get("/api/challenges/templates");
    expect(res.status()).toBe(200);
    const templates = await res.json();
    const names = (templates as any[]).map((t) => t.name);
    expect(names).toContain("Two-Step Evaluation");
    expect(names).toContain("One-Step Challenge");
    expect(names).toContain("Instant Funding");
  });

  test("a demo purchase creates an active challenge for the user", async ({ page, request }) => {
    const cookie = await ensureSeeded(request);
    const { challengeId, label } = await createDemoPurchase(request, cookie, {
      templateName: "Two-Step Evaluation",
      sizeLabel: "$25,000",
    });
    expect(challengeId).toBeGreaterThan(0);
    expect(label).toContain("Two-Step Evaluation");

    // The challenge now shows up for the owning user.
    const res = await request.get("/api/challenges/my", {
      headers: { cookie: `afc_session=${cookie}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const mine = body.challenges || body || [];
    expect(mine.some((c: any) => c.id === challengeId)).toBeTruthy();

    await signInAdminFast(page, request, "/dashboard/challenges");
    await expect(page.getByText("Two-Step Evaluation").first()).toBeVisible({ timeout: 15_000 });
  });
});

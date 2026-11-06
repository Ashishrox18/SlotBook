import { test, expect } from "@playwright/test";

// End-to-end guest lifecycle: pick a slot, hold, confirm, and verify the
// notification outbox recorded the event.

test("guest can hold and confirm a slot", async ({ page }) => {
  await page.goto("/alex-morgan/office-hours");

  // Wait for slot buttons to render.
  const slot = page.locator('[data-testid^="slot-"]').first();
  await expect(slot).toBeVisible({ timeout: 20_000 });
  await slot.click();

  // Hold UI appears with a countdown.
  await expect(page.getByText("Slot reserved for you")).toBeVisible();
  await page.fill("#gn", "Eve Guest");
  await page.fill("#ge", "eve@example.com");

  // Confirm.
  await page.getByTestId("confirm-booking").click();
  await expect(page.getByText("Booking confirmed")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Private management link created")).toBeVisible();
});

test("notification outbox shows the confirmed booking", async ({ page }) => {
  await page.goto("/notifications");
  await expect(page.getByText("booking.confirmed").first()).toBeVisible({ timeout: 20_000 });
});

test("booking page shows the host and a timezone selector", async ({ page }) => {
  await page.goto("/alex-morgan/intro-15");
  await expect(page.getByText("Alex Morgan")).toBeVisible();
  await expect(page.locator("#tz")).toBeVisible();
});

import { test, expect, type Page } from "@playwright/test";

async function confirmBooking(page: Page): Promise<string> {
  await page.goto("/alex-morgan/office-hours");
  const slot = page.locator('[data-testid^="slot-"]').first();
  await expect(slot).toBeVisible({ timeout: 20_000 });
  await slot.click();
  await page.fill("#gn", "Eve Guest");
  await page.fill("#ge", "eve@example.com");
  await page.getByTestId("confirm-booking").click();
  await expect(page.getByText("Booking confirmed")).toBeVisible({ timeout: 15_000 });
  const href = await page.getByRole("link", { name: /Open your booking/ }).getAttribute("href");
  expect(href).toBeTruthy();
  return href!;
}

function futureWeekday(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

test("guest can reschedule a confirmed booking", async ({ page }) => {
  const href = await confirmBooking(page);
  await page.goto(href);
  await expect(page.getByText("Reschedule")).toBeVisible();

  const date = futureWeekday(8);
  await page.fill("#rdate", date);
  const slot = page.locator('[data-testid^="reschedule-slot-"]').first();
  await expect(slot).toBeVisible({ timeout: 20_000 });
  await slot.click();
  await page.getByTestId("reschedule").click();
  await expect(page.getByText("Rescheduled successfully.")).toBeVisible({ timeout: 15_000 });
});

test("guest can cancel a confirmed booking with a reason", async ({ page }) => {
  const href = await confirmBooking(page);
  await page.goto(href);
  await page.fill("#cancel-reason", "Something came up");
  await page.getByTestId("cancel-booking").click();
  await expect(page.getByText("Booking cancelled.")).toBeVisible({ timeout: 15_000 });
});

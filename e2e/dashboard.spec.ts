import { test, expect } from "@playwright/test";

test("host can log in to the dashboard", async ({ page }) => {
  await page.goto("/dashboard/login");
  await expect(page.getByText("slotbook-demo")).toBeVisible();
  await page.fill('input[type="password"]', "slotbook-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(/Welcome/)).toBeVisible();
});

test("reliability page shows database health", async ({ page }) => {
  await page.goto("/reliability");
  await expect(page.getByText("Database health")).toBeVisible();
  await expect(page.getByText("How capacity is protected")).toBeVisible();
});

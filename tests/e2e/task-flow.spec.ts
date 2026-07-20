import { expect, test } from "@playwright/test";

test("mock user creates a task without duplicate submission", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("login-admin").click();
  await expect(page).toHaveURL(/\/tasks\/new$/);
  const submitButton = page.getByRole("button", { name: "Создать задачу", exact: true });
  await expect(submitButton).toBeEnabled();
  await page.getByLabel("Название задачи *").fill("Проверить мобильную форму");
  await submitButton.click();
  await expect(page.getByText("Задача создана", { exact: true })).toBeVisible();
  await expect(page.getByText("Проверить мобильную форму")).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать еще" })).toBeVisible();
});

test("manifest is available and install page explains iPhone flow", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe("standalone");
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Task Launcher на главном экране" })).toBeVisible();
  await expect(page.getByText("На экран Домой")).toBeVisible();
});

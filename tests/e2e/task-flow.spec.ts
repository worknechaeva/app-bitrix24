import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, role: "admin" | "editor" = "admin") {
  await page.goto("/login");
  await page.getByTestId(`login-${role}`).click();
  await expect(page).toHaveURL(/\/tasks\/new$/);
}

async function selectProject(page: Page, name = "Технарост") {
  await page.getByLabel("Проект *").click();
  await page.getByRole("option", { name }).click();
}

async function openAdditionalParameters(page: Page) {
  await page.getByText("Дополнительные параметры", { exact: true }).click();
}

test("mock user creates a task without duplicate submission", async ({ page }) => {
  await login(page);
  await selectProject(page);
  const submitButton = page.getByRole("button", { name: "Создать задачу", exact: true });
  await expect(submitButton).toBeEnabled();
  await page.getByLabel("Название задачи *").fill("Проверить мобильную форму");
  await submitButton.click();
  await expect(page.getByText("Задача создана", { exact: true })).toBeVisible();
  await expect(page.getByText("Проверить мобильную форму")).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать еще" })).toBeVisible();
});

test("recent project opens a form with that project selected", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await page.getByRole("link", { name: /Форма/ }).click();
  await expect(page).toHaveURL(/\/tasks\/new\?projectId=forma$/);
  await expect(page.getByLabel("Проект *")).toContainText("Форма");

  await page.goto("/tasks/new?projectId=missing-project");
  await expect(page.getByLabel("Проект *")).toContainText("Выберите проект");
});

test("deadline starts empty, can be selected and cleared", async ({ page }) => {
  await login(page);
  await selectProject(page);
  await openAdditionalParameters(page);
  const deadline = page.getByLabel("Срок");
  await expect(deadline).toHaveValue("");
  await deadline.fill("2026-08-15");
  await expect(deadline).toHaveValue("2026-08-15");
  await page.getByRole("button", { name: "Очистить" }).click();
  await expect(deadline).toHaveValue("");
  await page.getByLabel("Название задачи *").fill("Задача без срока");
  await page.getByRole("button", { name: "Создать задачу", exact: true }).click();
  await expect(page.getByText("Задача создана", { exact: true })).toBeVisible();
  await expect(page.getByText("Не указан", { exact: true })).toBeVisible();
});

test("removed fields stay absent and a file can be added and removed", async ({ page }) => {
  await login(page);
  await openAdditionalParameters(page);
  await expect(page.getByText("Приоритет", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Оценка, часов/i)).toHaveCount(0);
  await expect(page.getByText(/Учет времени/i)).toHaveCount(0);

  await page.getByLabel("Прикрепить файлы").setInputFiles({
    name: "brief.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("safe mock file"),
  });
  await expect(page.getByText("brief.pdf", { exact: true })).toBeVisible();
  await expect(page.getByText(/Б$/)).toBeVisible();
  await page.getByRole("button", { name: "Удалить файл brief.pdf" }).click();
  await expect(page.getByText("brief.pdf", { exact: true })).toHaveCount(0);
});

test("timeout allows an explicit retry with a new attempt", async ({ page }) => {
  await login(page);
  await selectProject(page);
  await page.getByLabel("Название задачи *").fill("Проверить timeout");
  await openAdditionalParameters(page);
  await page.getByLabel("Mock-сценарий для проверки").click();
  await page.getByRole("option", { name: "Неизвестный статус после timeout" }).click();
  await page.getByRole("button", { name: "Создать задачу", exact: true }).click();
  await expect(page.getByText("Статус создания неизвестен")).toBeVisible();
  await page.getByRole("button", { name: "Попробовать снова" }).click();
  await page.getByRole("button", { name: "Создать задачу", exact: true }).click();
  await expect(page.getByText("Задача создана", { exact: true })).toBeVisible();
});

test("history is compact, has domain statuses and filters by project", async ({ page }) => {
  await login(page);
  await page.goto("/submissions");
  await expect(page.getByText("В работе", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Завершена", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.getByLabel("Проект").click();
  await page.getByRole("option", { name: "Форма" }).click();
  await expect(page.getByText("Обновить текст на главной странице").filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Проверить форму обратной связи")).toHaveCount(0);
});

test("administrator can create and edit a mock project", async ({ page }, testInfo) => {
  await login(page);
  await page.goto("/projects");
  const suffix = testInfo.project.name.replaceAll(/[^a-z]/g, "");
  const initialName = `QA проект ${suffix}`;
  const editedName = `${initialName} обновлен`;
  await page.getByRole("button", { name: "Добавить проект" }).click();
  await page.getByLabel("Название *").fill(initialName);
  await page.getByLabel("Адрес сайта").fill(`https://${suffix || "qa"}.example`);
  await page.getByLabel("ID рабочей группы Bitrix24 *").fill("901");
  await page.getByLabel("Название рабочей группы *").fill("QA группа");
  await page.getByLabel("Обязательный тег *").fill(`${suffix || "qa"}.example`);
  await page.getByTestId("project-form").getByRole("button", { name: "Добавить проект" }).click();
  await expect(page.getByText("Проект добавлен")).toBeVisible();

  const card = page.locator("[data-slot=card]", { hasText: initialName }).first();
  await card.getByRole("button", { name: "Редактировать" }).click();
  await page.getByLabel("Название *").fill(editedName);
  await page.getByRole("button", { name: "Сохранить проект" }).click();
  await expect(page.getByText("Проект сохранен")).toBeVisible();
  await expect(page.getByText(editedName, { exact: true })).toBeVisible();
});

test("editor cannot manage projects", async ({ page }) => {
  await login(page, "editor");
  await page.goto("/projects");
  await expect(page.getByRole("button", { name: "Добавить проект" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Редактировать" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Выключить|Включить/ })).toHaveCount(0);
  await expect(page.getByText("Архивный проект")).toHaveCount(0);
});

test("dashboard has no greeting and keeps the all-tasks link aligned", async ({ page }) => {
  await login(page);
  await page.goto("/");
  await expect(page.getByText("Добрый день", { exact: true })).toHaveCount(0);
  const heading = page.getByText("Последние задачи", { exact: true });
  const link = page.getByTestId("all-tasks-link");
  await expect(link).toHaveText(/Все задачи/);
  const [headingBox, linkBox] = await Promise.all([heading.boundingBox(), link.boundingBox()]);
  expect(headingBox).not.toBeNull();
  expect(linkBox).not.toBeNull();
  expect(Math.abs(headingBox!.y - linkBox!.y)).toBeLessThan(24);
});

test("mobile user menu does not overlap stable bottom navigation", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop-chromium", "Проверка относится к мобильным viewport");
  await login(page);
  const userMenu = page.getByTestId("mobile-user-menu");
  const navigation = page.getByTestId("mobile-navigation");
  await expect(userMenu).toBeVisible();
  await expect(navigation).toBeVisible();
  const [menuBox, navigationBox] = await Promise.all([userMenu.boundingBox(), navigation.boundingBox()]);
  expect(menuBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(menuBox!.y + menuBox!.height).toBeLessThan(navigationBox!.y);
  for (const link of await navigation.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("manifest is available and install page explains iPhone flow", async ({ page, request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  expect((await manifest.json()).display).toBe("standalone");
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "Task Launcher на главном экране" })).toBeVisible();
  await expect(page.getByText("На экран Домой")).toBeVisible();
});

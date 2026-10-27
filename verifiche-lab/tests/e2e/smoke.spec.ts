import { expect, test } from "@playwright/test";

const TEACHER = {
  email: "docente@verifichelab.local",
  password: "Docente1234!",
};

test("accesso docente, dashboard e apertura di una verifica", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /Bentornata, bentornato/i })).toBeVisible();

  await page.getByLabel("Email").fill(TEACHER.email);
  await page.locator("#password").fill(TEACHER.password);
  await page.getByRole("button", { name: /Accedi/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: /Nuova verifica/i }).first()).toBeVisible();

  await page.goto("/verifiche");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/Verifica dimostrativa/i).first()).toBeVisible();

  await page.getByText(/Verifica dimostrativa/i).first().click();
  await expect(page).toHaveURL(/\/verifiche\/[^/]+/);
  await expect(page.getByRole("button", { name: /Quesiti/i }).first()).toBeVisible();
});

test("le credenziali errate non aprono la dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("docente@verifichelab.local");
  await page.locator("#password").fill("password-sbagliata");
  await page.getByRole("button", { name: /Accedi/i }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/Email o password non corretti/i)).toBeVisible();
});

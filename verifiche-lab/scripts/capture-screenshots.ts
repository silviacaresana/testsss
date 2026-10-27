/**
 * Cattura le schermate usate in docs/guida-docenti.md.
 *
 * Richiede un server già avviato (npm run dev oppure npm start).
 * Uso: npm run docs:screenshots
 */

import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
const outDir = path.join(process.cwd(), "docs", "images");

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(outDir, "login.png"), fullPage: true });

    await page.getByLabel("Email").fill("docente@verifichelab.local");
    await page.locator("#password").fill("Docente1234!");
    await page.getByRole("button", { name: /Accedi/i }).click();
    await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(outDir, "dashboard.png"), fullPage: true });

    await page.goto(`${baseUrl}/verifiche`, { waitUntil: "networkidle" });
    await page.getByText(/Verifica dimostrativa/i).first().click();
    await page.waitForURL(/\/verifiche\/[^/]+/, { timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: path.join(outDir, "editor.png"), fullPage: true });
  } finally {
    await browser.close();
  }

  console.log(`Schermate scritte in ${outDir}`);
}

main().catch((error) => {
  console.error("Cattura schermate fallita:", error);
  process.exitCode = 1;
});

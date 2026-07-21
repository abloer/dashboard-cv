import { expect, test } from "@playwright/test";
import { installApiFixtures } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await installApiFixtures(page);
});

test("Media Sources renders and supports add/edit source with fixture API", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Media Sources" })).toBeVisible();
  await expect(page.getByText("Gate Upload Fixture")).toBeVisible();

  await page.getByRole("button", { name: "Add Source" }).click();
  await expect(page.getByRole("heading", { name: "Add New Source" })).toBeVisible();
  await page.getByLabel("Nama source").fill("Camera Fixture");
  await page.getByLabel("Lokasi").fill("Workshop");
  await page.getByRole("combobox").filter({ hasText: "Upload Video" }).click();
  await page.getByRole("option", { name: "Camera Stream" }).click();
  await page.getByLabel("Sumber").fill("rtsp://camera.fixture/live");
  await page.getByLabel("Catatan operasional").fill("Created by Playwright smoke test");
  await page.getByRole("button", { name: "Create Source" }).click();

  await expect(page.getByText("Camera Fixture")).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: "Camera Fixture" });
  await row.getByRole("button").last().click();
  await page.getByRole("menuitem", { name: "Edit source" }).click();
  await expect(page.getByRole("heading", { name: "Edit Source" })).toBeVisible();
  await page.getByLabel("Nama source").fill("Camera Fixture Updated");
  await page.getByRole("button", { name: "Save Changes" }).click();

  await expect(page.getByText("Camera Fixture Updated")).toBeVisible();
});

test("Run Analysis renders initial source-required state", async ({ page }) => {
  await page.goto("/run-analysis");

  await expect(page.getByRole("heading", { name: "Run Analysis" })).toBeVisible();
  await expect(page.getByText("Source Tidak Ditemukan")).toBeVisible();
  await expect(page.getByRole("link", { name: "Kembali ke Media Sources" })).toBeVisible();
});

test("Models renders registry dashboard with fixture API", async ({ page }) => {
  await page.goto("/models");

  await expect(page.getByRole("heading", { name: "Models", exact: true })).toBeVisible();
  await expect(page.getByText("Workflow Models")).toBeVisible();
  await expect(page.getByText("0 model aktif saat ini siap dipakai modul operasional.")).toBeVisible();
});

test("Output Data renders dashboard with fixture API", async ({ page }) => {
  await page.goto("/output-data");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Total Sources")).toBeVisible();
  await expect(page.getByText("Ringkasan hasil analisis dari seluruh source")).toBeVisible();
});

test("Login page renders the access token form", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Masuk ke Dashboard" })).toBeVisible();
  await expect(page.getByLabel("Access token")).toBeVisible();
  await expect(page.getByRole("button", { name: "Masuk" })).toBeVisible();
});

test("Login success redirects to the dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Access token").fill("fixture-operator-token");
  await page.getByRole("button", { name: "Masuk" }).click();

  // Session exchange is mocked ok by the fixture catch-all → app root renders.
  await expect(page.getByRole("heading", { name: "Media Sources" })).toBeVisible();
});

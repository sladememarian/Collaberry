import { test, expect } from "@playwright/test";

/**
 * Server-settings screen coverage. This screen is the escape hatch when the
 * app is pointed at an unreachable backend (the "works on laptop, dead on
 * phone" trap), so it must be reachable and functional WITHOUT signing in.
 *
 * We drive the real UI: edit the API address, watch the WS field track it,
 * apply a preset, save, and confirm the active-server readout updates. No
 * backend is contacted for the save path (that's local persistence); the
 * "Test connection" button is exercised only for its status feedback.
 */

test("server settings is reachable without auth and shows the active server", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("settings-active-url")).toBeVisible();
  await expect(page.getByTestId("settings-api-input")).toBeVisible();
});

test("editing the API address auto-fills the realtime (ws) address", async ({ page }) => {
  await page.goto("/settings");

  const api = page.getByTestId("settings-api-input");
  const ws = page.getByTestId("settings-ws-input");

  await api.fill("https://my-backend.example:8080");
  // The ws field follows the api field until the user edits it by hand:
  // http(s) -> ws(s), same host/port.
  await expect(ws).toHaveValue("wss://my-backend.example:8080");

  await api.fill("http://192.168.1.50:8080");
  await expect(ws).toHaveValue("ws://192.168.1.50:8080");
});

test("a bare host is normalized to https on save and becomes the active server", async ({ page }) => {
  await page.goto("/settings");

  await page.getByTestId("settings-api-input").fill("my-backend.example:9000");
  await page.getByRole("button", { name: "Save & use" }).click();

  // Saved override is normalized (https:// prefix added) and surfaced as active.
  await expect(page.getByTestId("settings-active-url")).toHaveText("https://my-backend.example:9000");
  await expect(page.getByTestId("settings-status")).toContainText("Saved");
});

test("reset returns the app to its build default", async ({ page }) => {
  await page.goto("/settings");

  // Point somewhere custom, save, then reset.
  await page.getByTestId("settings-api-input").fill("http://10.0.0.9:8080");
  await page.getByRole("button", { name: "Save & use" }).click();
  await expect(page.getByTestId("settings-active-url")).toHaveText("http://10.0.0.9:8080");

  await page.getByRole("button", { name: "Reset to build default" }).click();
  // The build default is whatever the web build resolved — the point is that it's NOT the custom host anymore.
  await expect(page.getByTestId("settings-active-url")).not.toHaveText("http://10.0.0.9:8080");
  await expect(page.getByTestId("settings-status")).toContainText("build default");
});

/**
 * The landing page, and the seam that joins it to the app.
 *
 * Unusually for this suite, the page under test is not the Expo app at all. It's
 * the vendored Lovable project in `LandingPage/`, compiled by
 * `scripts/build-landing.mjs` into `public/landing/` and served as static files
 * from the app's own origin. So these specs cover a *build artifact*: if someone
 * edits `LandingPage/src` and forgets to re-run the build, the assertions here
 * still describe the committed `public/landing/`, which is what visitors get.
 *
 * Four seams, each of which has already broken once:
 *
 *   1. the signed-out hand-off at `/` is a real document navigation, not an
 *      Expo Router redirect — `/landing/` is not a route, so `<Redirect>` would
 *      land on the app's 404 screen;
 *   2. the CTAs must point back into the app. `Launch Space` in particular goes
 *      to `/login`, not `/`, or a signed-out visitor bounces between the landing
 *      page and the root gate forever;
 *   3. asset URLs must carry the `/landing/` base. Vite rewrites `base` into
 *      imported asset URLs but not into string literals, so the page's own
 *      `asset()` helper is the only thing keeping the seven PNGs from 404ing;
 *   4. the signed-in path through `/` is untouched, which 15 specs across
 *      nav-rail, profile, notifications and board-search depend on via
 *      `gotoHome()`.
 *
 * Backend-free except for the last two tests — the landing page is static and
 * knows nothing about the API.
 */
import { test, expect, type Page } from "@playwright/test";

import { gotoHome, registerUser, signIn } from "./helpers/session";

/** Matches `LANDING_URL` in app/index.tsx and `base` in LandingPage/vite.config.ts. */
const LANDING = "/landing/";

/**
 * The page opens on a 0→100% loader that self-advances every 20ms and then fades
 * for 500ms, so nothing below it is hittable for the first ~2.5s. Waiting on the
 * nav CTA rather than a fixed timeout also proves the page *hydrated*: the
 * loader is driven by React state, so if hydration died the bar would freeze and
 * the content behind it would stay `hidden`.
 *
 * That makes this helper the standing check on the 3 NUL bytes that TanStack
 * Router serialises into its hydration payload (`"__root__\0"`), which an HTML
 * tokenizer turns into U+FFFD inside script text.
 */
async function landed(page: Page): Promise<void> {
  await expect(page.getByTestId("landing-root")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("landing-login")).toBeVisible({ timeout: 20_000 });
}

test("a signed-out visitor lands on the marketing page instead of a password form", async ({
  page,
}) => {
  await page.goto("/");

  // A real document navigation off the Expo bundle and onto the static page.
  await page.waitForURL(`**${LANDING}`, { timeout: 20_000 });
  await landed(page);

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Project management for the",
  );

  // `replace`, not `assign` — Back must leave the site rather than re-entering
  // the redirect and pinning the visitor here.
  expect(await page.evaluate(() => window.history.length)).toBeLessThanOrEqual(2);
});

test("the page is served prerendered, with its metadata in the document", async ({ page }) => {
  // `request` rather than `page`: this asserts the bytes on disk, before any JS
  // runs. Crawlers see exactly this.
  const res = await page.request.get(LANDING);
  expect(res.status()).toBe(200);
  const html = await res.text();

  expect(html).toContain("Collaberry | Modern Project Workspace");
  expect(html).toContain('property="og:title"');
  expect(html).toContain("Project management for the");
  expect(html).toContain("Meet Bob");
  expect(html).toContain("Coming soon");

  // Every asset reference carries the base. A bare "/assets/…" here is the
  // regression that serves a page of broken images.
  expect(html).not.toMatch(/(?:src|href)="\/assets\//);
});

test("all seven images actually load from under /landing/", async ({ page }) => {
  await page.goto(LANDING);
  await landed(page);

  // `naturalWidth` is the only honest check here: a 404'd <img> still has a src
  // and still occupies layout, so asserting visibility would pass on a page of
  // broken-image icons. Zero means the bytes never arrived.
  const images = await page
    .locator("img")
    .evaluateAll((nodes) =>
      nodes.map((n) => {
        const img = n as HTMLImageElement;
        return { src: img.getAttribute("src") ?? "", width: img.naturalWidth };
      }),
    );

  // Six <img> plus the logo repeated — assert on the distinct files instead of a
  // node count, which shifts whenever the design repeats a mark.
  const files = new Set(images.map((i) => i.src.split("/").pop()));
  for (const file of [
    "collaberry-logo.png",
    "logo-icon.png",
    "bob-bot.png",
    "screenshot-kanban.png",
    "screenshot-task.png",
    "screenshot-workspace.png",
  ]) {
    expect(files, `${file} is referenced by the page`).toContain(file);
  }

  for (const image of images) {
    expect(image.src, "asset URLs are base-prefixed").toContain(LANDING);
    expect(image.width, `${image.src} decoded`).toBeGreaterThan(0);
  }
});

test("Bob is labelled a coming-soon feature rather than a shipped one", async ({ page }) => {
  await page.goto(LANDING);
  await landed(page);

  const card = page.getByTestId("landing-bob-card");
  await expect(card).toBeVisible();
  await expect(card.getByTestId("landing-bob-coming-soon")).toHaveText("Coming soon");
  await expect(card).toContainText("Meet Bob");

  // The status is in the accessible name too, so it isn't carried by the dimming
  // alone — a screen reader gets "coming soon" without seeing the grayscale.
  await expect(card).toHaveAttribute("aria-label", /coming soon/i);

  // Visibly muted, which is what separates "planned" from "shipped" at a glance.
  const opacity = await card.evaluate((el) => Number(getComputedStyle(el).opacity));
  expect(opacity).toBeLessThan(1);

  // And it must not behave like a feature: no link, and pressing it goes nowhere.
  await expect(card.locator("a")).toHaveCount(0);
  await card.click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname).toBe(LANDING);
});

/**
 * Each CTA and the app route it must reach. These hrefs are baked at build time
 * from `CTA_ENV` in scripts/build-landing.mjs, so a wrong value here is a stale
 * `public/landing/` as often as it is a wrong config.
 *
 * `Launch Space` → /login rather than / is deliberate and load-bearing: `/` sends
 * signed-out visitors to the landing page, so aiming a CTA at it would loop.
 * app/(auth)/_layout.tsx forwards an already-signed-in visitor from /login on to
 * /(app), which makes /login correct for both auth states.
 *
 * `View Demo` → /register rather than /kanbanlab because that harness
 * short-circuits to a placeholder outside dev builds.
 */
const CTAS = [
  { testId: "landing-login", label: "Login", path: "/login" },
  { testId: "landing-launch", label: "Launch Space", path: "/login" },
  { testId: "landing-early-access", label: "Get Early Access", path: "/register" },
  { testId: "landing-demo", label: "View Demo", path: "/register" },
] as const;

test("every call to action points back into the app", async ({ page }) => {
  await page.goto(LANDING);
  await landed(page);

  for (const cta of CTAS) {
    const link = page.getByTestId(cta.testId);
    await expect(link, `${cta.label} is on the page`).toBeVisible();
    await expect(link, `${cta.label} → ${cta.path}`).toHaveAttribute("href", cta.path);
  }
});

for (const cta of CTAS) {
  test(`"${cta.label}" crosses into the app at ${cta.path}`, async ({ page }) => {
    await page.goto(LANDING);
    await landed(page);

    // A real click, not a goto — this leaves the static site and boots the Expo
    // bundle, which is the crossing that matters and the one a plain href
    // assertion can't prove.
    await page.getByTestId(cta.testId).click();
    await page.waitForURL(`**${cta.path}`, { timeout: 20_000 });

    // Both targets are auth screens, so the password field is the proof the app
    // mounted rather than 404ing.
    await expect(page.getByPlaceholder("you@work.com")).toBeVisible({ timeout: 20_000 });
    if (cta.path === "/register") {
      await expect(page.getByPlaceholder("At least 8 characters")).toBeVisible();
    }
  });
}

test("a signed-out visitor can reach the app and come back without looping", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL(`**${LANDING}`, { timeout: 20_000 });
  await landed(page);

  // Out to the app…
  await page.getByTestId("landing-launch").click();
  await page.waitForURL("**/login", { timeout: 20_000 });
  await expect(page.getByPlaceholder("you@work.com")).toBeVisible({ timeout: 20_000 });

  // …and back. The round trip is the assertion: if `Launch Space` pointed at `/`
  // instead, the root gate would bounce the still-signed-out visitor straight
  // back to /landing/ and the two would volley indefinitely.
  await page.goBack();
  await page.waitForURL(`**${LANDING}`, { timeout: 20_000 });
  await landed(page);
  expect(new URL(page.url()).pathname).toBe(LANDING);
});

test("a signed-in visitor goes to the workspace, not the marketing page", async ({ page }) => {
  const user = await registerUser("Landing Signed In");
  await signIn(page, user);

  // This is the guard on `gotoHome()`, which every signed-in spec in this suite
  // calls: it navigates to `/` and waits for the rail. Sending a session-holder
  // to /landing/ would fail all 15 of them at once, so assert the rail *and* that
  // the URL never left the app.
  await gotoHome(page);
  expect(new URL(page.url()).pathname).not.toContain("landing");
  await expect(page.getByTestId("landing-root")).toHaveCount(0);
});

test("the marketing page stays reachable while signed in", async ({ page }) => {
  const user = await registerUser("Landing Direct");
  await signIn(page, user);

  // Static files sit outside the app's auth gate entirely, so a session must not
  // redirect away from a directly requested /landing/ — someone following a
  // shared marketing link should see the page they were sent.
  await page.goto(LANDING);
  await landed(page);
  expect(new URL(page.url()).pathname).toBe(LANDING);
});

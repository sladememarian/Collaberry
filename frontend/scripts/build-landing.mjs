/**
 * Builds the vendored Lovable landing page and installs it into the Expo app's
 * public folder, so it ships from the app's own origin at /landing/.
 *
 *   node scripts/build-landing.mjs
 *
 * Why a script rather than a plain `vite build`:
 *
 *   · The Vite build writes `dist/client` (the static site) *and* `dist/server`
 *     (an SSR bundle used only to prerender the HTML at build time). Only the
 *     former is shippable; copying both would put a dead Node server into the
 *     web bundle.
 *   · Expo serves `public/` verbatim — in dev via ServeStaticMiddleware, and on
 *     `expo export` via copyPublicFolderAsync — so `public/landing/` is all it
 *     takes to get a second, non-React-Native page on the same origin. No extra
 *     process, no second port, no CORS.
 *   · The output is committed, so `expo export` and the Playwright suite work
 *     without the landing page's separate 400-package toolchain installed.
 *     Re-run this after editing LandingPage/ and commit the result.
 *
 * The CTA targets are baked in here rather than in the Lovable source, so the
 * design stays regenerable: re-syncing from Lovable can clobber the component
 * tree, but these env vars survive because they live outside it.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "LandingPage");
const built = path.join(source, "dist", "client");
const target = path.join(root, "public", "landing");

/**
 * Where the landing page's buttons point, all of them real Expo Router URLs.
 * Route groups like `(auth)` do not appear in the URL, so `/login` and
 * `/register` are the actual paths.
 *
 * "Launch Space" deliberately goes to /login rather than to `/`. The root route
 * sends signed-out visitors here to the landing page, so pointing a landing CTA
 * back at `/` would bounce a signed-out user between the two forever. /login is
 * correct for both states: app/(auth)/_layout.tsx redirects an already
 * signed-in visitor on to /(app).
 *
 * "View Demo" points at register rather than /kanbanlab because that harness
 * short-circuits to a placeholder outside dev builds — a public button that
 * dead-ends in production is worse than one more path to sign-up.
 */
const CTA_ENV = {
  VITE_APP_URL: "/login",
  VITE_APP_LOGIN_URL: "/login",
  VITE_APP_REGISTER_URL: "/register",
  VITE_APP_DEMO_URL: "/register",
};

function run() {
  if (!fs.existsSync(path.join(source, "node_modules"))) {
    console.error(
      `[build-landing] ${path.relative(root, source)}/node_modules is missing.\n` +
        `[build-landing] Run \`npm install\` in that folder first — it is a separate\n` +
        `[build-landing] project with its own dependency tree (Vite/TanStack, not Expo).`,
    );
    process.exit(1);
  }

  console.log("[build-landing] building…");
  execFileSync("npx", ["vite", "build"], {
    cwd: source,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...CTA_ENV,
      // Proxy vars break localhost tooling on this machine; the build is
      // entirely offline, so drop them rather than fight them.
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      http_proxy: "",
      https_proxy: "",
    },
  });

  const html = path.join(built, "index.html");
  if (!fs.existsSync(html)) {
    console.error(
      `[build-landing] build finished but ${path.relative(root, html)} is absent.\n` +
        `[build-landing] The prerender step did not run — check that vite.config.ts still\n` +
        `[build-landing] sets tanstackStart.pages and leaves nitro off.`,
    );
    process.exit(1);
  }

  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(built, target, { recursive: true });

  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(path.relative(target, full).split(path.sep).join("/"));
    }
  };
  walk(target);

  console.log(`\n[build-landing] installed ${files.length} files into public/landing/:`);
  for (const file of files.sort()) console.log(`  ${file}`);
  console.log("\n[build-landing] serving at /landing/ — commit public/landing/ to ship it.");
}

run();

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  /**
   * The landing page ships as plain files from the Expo app's own origin
   * (frontend/public/landing/), so there is no Node or Cloudflare runtime to
   * deploy to. Left at its default this plugin turns nitro on and emits a
   * cloudflare-module server bundle, which is dead weight here.
   *
   * Turning nitro off does not cost the prerendered HTML, which is the thing
   * that made this look load-bearing at first: prerender is driven by Start's
   * own preview-server plugin, and that plugin boots `dist/server/server.js` —
   * precisely the path Vite's SSR build writes to when nitro is *not* in the
   * way. With nitro on, the bundle is relocated to `.output/server/index.mjs`
   * and prerendering dies with ERR_MODULE_NOT_FOUND on the path above.
   */
  nitro: false,

  vite: {
    base: "/landing/",
    build: {
      outDir: "dist",
      // public/assets/ holds the seven real PNGs and would otherwise be merged
      // with Vite's own hashed chunk output, which also defaults to "assets".
      assetsDir: "static",
    },
  },

  tanstackStart: {
    server: { entry: "server" },

    /**
     * Emits real HTML at build time, so the title/description/og tags are in
     * the document for crawlers rather than appearing only after hydration.
     *
     * The route list goes in `pages`, not in `prerender` — `prerender` accepts
     * `enabled`/`crawlLinks`/`failOnError` and friends, and its Zod schema
     * silently drops unknown keys, so a `prerender: { routes: [...] }` parses
     * fine and then prerenders nothing.
     */
    prerender: { enabled: true, failOnError: true, crawlLinks: false },
    pages: [{ path: "/", prerender: { enabled: true } }],
  },
});

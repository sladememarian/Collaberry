/**
 * Root route — the boot gate, and the door to the landing page.
 *
 * A signed-out visitor is sent to the marketing page built from LandingPage/ and
 * served as static files from this app's own origin (see
 * scripts/build-landing.mjs). A signed-in visitor goes straight to their
 * workspace instead: bouncing a returning user through marketing on every launch
 * is a tax, not a welcome.
 *
 * The landing page is deliberately not an Expo Router route, so `Redirect`
 * cannot reach it — that only rewrites the in-app history stack and would land
 * on a 404 screen. It needs a real document navigation, hence `window.location`.
 * `replace` rather than `assign` so Back returns to wherever the visitor came
 * from instead of re-entering this redirect.
 *
 * Keeping the signed-in branch on `/` is load-bearing for the test suite:
 * gotoHome() in e2e-web/helpers/session.ts navigates to `/` and waits for the
 * nav rail, and every signed-in spec depends on it.
 */
import { Redirect } from "expo-router";
import React, { useEffect } from "react";
import { Platform, View } from "react-native";

import { useAuth } from "@/context/AuthContext";

/**
 * Matches the `base` in LandingPage/vite.config.ts. The trailing slash is not
 * cosmetic: the landing page is a TanStack Router app mounted at this base, so
 * its client router only matches when the pathname *is* the base. Naming the file
 * (/landing/index.html) serves the right bytes but leaves the router with an
 * unmatched `index.html` route and nothing rendered.
 *
 * A directory URL has no extension, though, which puts it in the same bucket as
 * every in-app deep link — so the static host's SPA fallback must be written to
 * leave this prefix alone or it answers with the Expo bundle, which has no
 * /landing route and shows "Unmatched Route" instead. See public/serve.json.
 */
export const LANDING_URL = "/landing/";

export default function Index() {
  const { booting, token } = useAuth();
  const leaving = !booting && !token && Platform.OS === "web";

  useEffect(() => {
    if (leaving) window.location.replace(LANDING_URL);
  }, [leaving]);

  // Native has no landing page to leave to, so it keeps the original behaviour
  // of dropping straight into the auth stack.
  if (!booting && !token && Platform.OS !== "web") return <Redirect href="/(auth)/login" />;

  if (token) return <Redirect href="/(app)" />;

  // Blank during boot and during the hand-off to the landing page. A bare View
  // rather than AppContainer or a spinner: this route is a gate that resolves in
  // a frame or two, and either of those would flash their own backdrop before
  // the landing page's loader takes over — two loading states back to back.
  return <View />;
}

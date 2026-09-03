/**
 * Thin fetch wrapper around the Envoy gateway. Everything the app talks to goes
 * through one host (`apiBaseUrl`) — Envoy routes by path prefix, so the client
 * never needs to know which microservice answers.
 *
 * Host resolution order (first win):
 *   1. EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WS_URL
 *   2. app.json → expo.extra.apiBaseUrl / wsBaseUrl
 *   3. Platform-aware localhost fallback
 *        · web / iOS simulator → http://localhost:8080
 *        · Android emulator    → http://10.0.2.2:8080  (maps to host loopback)
 *        · physical Android    → still needs a LAN IP via env (we surface that)
 *
 * The resolved default can additionally be overridden at runtime from the
 * Settings screen (persisted in AsyncStorage) — no rebuild to switch servers.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

type Extra = { apiBaseUrl?: string; wsBaseUrl?: string };
const extra = (Constants.expoConfig?.extra ?? Constants.manifest2?.extra?.expoClient?.extra ?? {}) as Extra;

const DEFAULT_PORT = "8080";

function isLoopback(url: string | undefined | null): boolean {
  if (!url) return true;
  return /:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url);
}

function hostFallbackHttp(): string {
  // Android emulator cannot reach the host machine via "localhost".
  if (Platform.OS === "android") return `http://10.0.2.2:${DEFAULT_PORT}`;
  return `http://localhost:${DEFAULT_PORT}`;
}

function rewriteLoopbackForPlatform(url: string): string {
  if (Platform.OS !== "android") return url;
  // Keep explicit LAN / public hosts untouched. Only rewrite loopback so a
  // production APK built with localhost in app.json still works in the emulator.
  return url
    .replace("://localhost", "://10.0.2.2")
    .replace("://127.0.0.1", "://10.0.2.2")
    .replace("://0.0.0.0", "://10.0.2.2");
}

const configuredHttp =
  process.env.EXPO_PUBLIC_API_URL ??
  extra.apiBaseUrl ??
  hostFallbackHttp();

/** Build-time default — what the app uses until/unless an on-device override is saved. */
export const DEFAULT_API_BASE = rewriteLoopbackForPlatform(configuredHttp).replace(/\/$/, "");

const configuredWs =
  process.env.EXPO_PUBLIC_WS_URL ??
  extra.wsBaseUrl ??
  DEFAULT_API_BASE.replace(/^http/, "ws");

export const DEFAULT_WS_BASE = rewriteLoopbackForPlatform(configuredWs).replace(/\/$/, "");

// The live server address. Starts at the build default and can be re-pointed
// at runtime from the Settings screen — no rebuild needed to switch backends.
let apiBase = DEFAULT_API_BASE;
let wsBase = DEFAULT_WS_BASE;

export function getApiBase(): string {
  return apiBase;
}
export function getWsBase(): string {
  return wsBase;
}
/** True when the app is pointing at loopback — almost always wrong on a real phone. */
export function apiUsesLoopback(): boolean {
  return isLoopback(apiBase);
}

/** Turns an http(s) API URL into its ws(s) twin. */
export function deriveWsUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/i, "ws");
}

const SERVER_OVERRIDE_KEY = "collaberry.serverOverride";

/** Normalizes user input: trims, strips trailing slash, defaults to https:// when no scheme given. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, "");
  if (url && !/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

/** Rehydrates a saved on-device server override. Call once at boot, before the first request. */
export async function loadServerOverride(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SERVER_OVERRIDE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { api?: string; ws?: string };
    if (saved.api) {
      apiBase = rewriteLoopbackForPlatform(normalizeServerUrl(saved.api));
      wsBase = rewriteLoopbackForPlatform(
        saved.ws ? normalizeServerUrl(saved.ws) : deriveWsUrl(apiBase),
      );
    }
  } catch {
    // A corrupted override must never brick the app — fall back to the build default.
  }
}

/**
 * Points the app at a different backend and persists the choice across
 * restarts. Pass null to clear the override and return to the build default.
 */
export async function setServerOverride(api: string | null, ws?: string | null): Promise<void> {
  if (!api) {
    apiBase = DEFAULT_API_BASE;
    wsBase = DEFAULT_WS_BASE;
    await AsyncStorage.removeItem(SERVER_OVERRIDE_KEY);
    return;
  }
  const normalizedApi = normalizeServerUrl(api);
  const normalizedWs = ws ? normalizeServerUrl(ws) : deriveWsUrl(normalizedApi);
  apiBase = rewriteLoopbackForPlatform(normalizedApi);
  wsBase = rewriteLoopbackForPlatform(normalizedWs);
  await AsyncStorage.setItem(SERVER_OVERRIDE_KEY, JSON.stringify({ api: normalizedApi, ws: normalizedWs }));
}

/**
 * Cheap reachability probe for the Settings screen. Any HTTP answer — even a
 * 401/405 — proves the host is up and routable; only a network-level failure
 * (DNS, refused, timeout) counts as unreachable.
 *
 * "Answered" is not the same as "answered as the API", though: a proxy
 * interstitial replies 200 with HTML and would otherwise be reported as a
 * healthy server. We send the preview-proxy opt-out and then check that what
 * came back is actually JSON, so the probe agrees with what `request()` will see.
 */
export async function probeServer(
  url: string,
): Promise<{ ok: boolean; detail: string }> {
  const target = normalizeServerUrl(url);
  if (!target) return { ok: false, detail: "Enter a server address first." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${target}/api/v1/auth/login`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...previewProxyHeaders(target),
      },
      signal: controller.signal,
    });
    const kind = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!/json/i.test(kind)) {
      return {
        ok: false,
        detail:
          `Something answered (HTTP ${res.status}) but sent ${kind || "no content type"} ` +
          `instead of JSON — that's a proxy or sign-in page, not the API.`,
      };
    }
    return { ok: true, detail: `Server answered (HTTP ${res.status}).` };
  } catch {
    return {
      ok: false,
      detail: "No answer. Check the address, and that the backend is running.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Daytona's sandbox preview proxy puts an anti-phishing interstitial in front of
 * a preview host, and it decides who gets it by User-Agent — so the app's own
 * `fetch` is served the warning page too, not just address-bar navigations.
 *
 * That page comes back as **200 with an HTML body**, which is indistinguishable
 * from a successful call unless you read it: sign-in "succeeded" with an
 * undefined token, the shell saw no session and bounced straight back to
 * /login, and both the console and the network tab looked clean.
 *
 * The opt-out has to be a per-request header. The consent cookie the
 * interstitial sets can never help here: the API lives on a different preview
 * host than the app (`8080-…` vs `8081-…`), and a cross-origin `fetch` sends no
 * cookies at all. The proxy echoes this header in its preflight
 * `access-control-allow-headers`, so it costs no extra round trip.
 *
 * Scoped to the proxy's own hostname so other deployments don't carry a
 * vendor-specific header they have no use for.
 */
const PREVIEW_PROXY_HOST = /(^|\.)proxy\.daytona\.work$/i;

function previewProxyHeaders(base: string): Record<string, string> {
  try {
    if (PREVIEW_PROXY_HOST.test(new URL(base).hostname)) {
      return { "X-Daytona-Skip-Preview-Warning": "true" };
    }
  } catch {
    // Relative or malformed base — no proxy to opt out of.
  }
  return {};
}

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}
export function getAuthToken() {
  return authToken;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean; // default true
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, auth = true } = opts;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...previewProxyHeaders(getApiBase()),
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    throw new ApiError(0, null, networkHint(e));
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload = text ? safeJson(text) : null;

  if (!res.ok) {
    const detail = (payload as { detail?: unknown } | null)?.detail ?? payload;
    throw new ApiError(res.status, detail, humanError(res.status, detail));
  }

  /**
   * A 2xx whose body isn't JSON means something answered *instead of* the API —
   * a proxy interstitial, an SSO wall, a captive portal, a static index.html
   * from a misrouted path. `res.ok` is no defence: those all answer 200.
   *
   * Without this guard `safeJson` hands the raw HTML back as the payload, and a
   * caller reading `access_token` off it just gets `undefined` — a failure with
   * nothing to show the user and nothing red in the network tab. Fail loudly
   * instead; every endpoint here returns an object or 204, so a bare string is
   * always wrong.
   */
  if (typeof payload === "string") {
    throw new ApiError(res.status, payload, nonJsonError(res));
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function humanError(status: number, detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  const map: Record<number, string> = {
    401: "Your session expired — sign in again.",
    403: "You don't have access to that.",
    404: "We couldn't find that.",
    409: "That already exists.",
    423: "Someone else is editing this right now.",
    429: "Slow down a moment — too many requests.",
  };
  return map[status] ?? `Something went wrong (${status}).`;
}

function nonJsonError(res: Response): string {
  const kind = res.headers.get("content-type")?.split(";")[0]?.trim() || "an unknown type";
  return (
    `The server answered ${res.status} with ${kind} instead of JSON. ` +
    `Something in front of ${getApiBase()} is answering for it — a proxy warning ` +
    `page or sign-in wall. Open that address directly in a tab and accept whatever ` +
    `it shows, or point the app at the API's own host in Settings.`
  );
}

function networkHint(_e: unknown): string {
  if (Platform.OS === "android" && apiUsesLoopback()) {
    return (
      "Can't reach the server from this phone — it's pointed at itself. " +
      "Open Settings and enter your server's address (or your PC's LAN IP). " +
      "Emulators use 10.0.2.2 automatically."
    );
  }
  if (Platform.OS !== "web") {
    return `Can't reach the server at ${getApiBase()}. Check the address in Settings, and that the backend is up.`;
  }
  return `Can't reach the server at ${getApiBase()}. Is the stack up?`;
}

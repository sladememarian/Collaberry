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
      },
      signal: controller.signal,
    });
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

/**
 * Thin fetch wrapper around the Envoy gateway. Everything the app talks to goes
 * through one host (`apiBaseUrl`) — Envoy routes by path prefix, so the client
 * never needs to know which microservice answers.
 *
 * Host resolution order (first win):
 *   1. EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WS_URL
 *   2. app.json → expo.extra.apiBaseUrl / wsBaseUrl
 *   3. Platform-aware localhost fallback
 *        · web / iOS simulator → http://localhost:8088
 *        · Android emulator    → http://10.0.2.2:8088  (maps to host loopback)
 *        · physical Android    → still needs a LAN IP via env (we surface that)
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

type Extra = { apiBaseUrl?: string; wsBaseUrl?: string };
const extra = (Constants.expoConfig?.extra ?? Constants.manifest2?.extra?.expoClient?.extra ?? {}) as Extra;

const DEFAULT_PORT = "8088";

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

export const API_BASE = rewriteLoopbackForPlatform(configuredHttp).replace(/\/$/, "");

const configuredWs =
  process.env.EXPO_PUBLIC_WS_URL ??
  extra.wsBaseUrl ??
  API_BASE.replace(/^http/, "ws");

export const WS_BASE = rewriteLoopbackForPlatform(configuredWs).replace(/\/$/, "");

/** True when the build is still pointing at loopback — almost always wrong on a real phone. */
export const API_USES_LOOPBACK = isLoopback(API_BASE);

// Daytona sandbox preview URLs show an HTML "preview warning" interstitial to
// browser-like traffic on the first request (even though it's a 200), which
// silently corrupts every API response. This header opts out of it. It's a
// no-op against any non-Daytona host, so it's safe to always send.
const DAYTONA_SKIP_WARNING_HEADER = "X-Daytona-Skip-Preview-Warning";
// Daytona's proxy also reflects its own permissive Access-Control-Allow-Origin
// on every response by default, stacking a second, identical ACAO header on
// top of the one Envoy already sets correctly — browsers reject a response
// with more than one ACAO value. This opts out of Daytona's own CORS layer so
// only Envoy's header survives. Also a no-op against non-Daytona hosts.
const DAYTONA_DISABLE_CORS_HEADER = "X-Daytona-Disable-CORS";

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
    [DAYTONA_SKIP_WARNING_HEADER]: "true",
    [DAYTONA_DISABLE_CORS_HEADER]: "true",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && authToken) headers["Authorization"] = `Bearer ${authToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
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
  if (Platform.OS === "android" && API_USES_LOOPBACK) {
    return (
      "Can't reach the server from this phone. " +
      "Rebuild with EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:8088 " +
      "(find it with `ipconfig` / `ifconfig`). Emulators use 10.0.2.2 automatically."
    );
  }
  if (Platform.OS !== "web") {
    return `Can't reach the server at ${API_BASE}. Is the backend up, and is this device on the same Wi-Fi?`;
  }
  return `Can't reach the server at ${API_BASE}. Is the stack up?`;
}

/**
 * Thin fetch wrapper around the Envoy gateway. Everything the app talks to goes
 * through one host (`apiBaseUrl`) — Envoy routes by path prefix, so the client
 * never needs to know which microservice answers.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";

type Extra = { apiBaseUrl?: string; wsBaseUrl?: string };
const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

// On a physical device "localhost" points at the phone, not your dev box. Allow
// an override via EXPO_PUBLIC_API_URL; fall back to the app.json default.
export const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ?? extra.apiBaseUrl ?? "http://localhost:8080";
export const WS_BASE =
  process.env.EXPO_PUBLIC_WS_URL ?? extra.wsBaseUrl ?? API_BASE.replace(/^http/, "ws");

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

  const headers: Record<string, string> = { Accept: "application/json" };
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
    // Network-level failure (server down, CORS, offline).
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

function networkHint(e: unknown): string {
  const base = "Can't reach the server.";
  if (Platform.OS !== "web") {
    return `${base} If you're on a device, set EXPO_PUBLIC_API_URL to your machine's LAN IP.`;
  }
  return `${base} Is the stack up? (\`make up\`)`;
}

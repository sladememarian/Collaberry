/**
 * Shared setup for the specs that need a signed-in app against the live backend.
 *
 * These features (nav rail, profile, notifications, board search) all live
 * behind the authenticated shell in `app/(app)/_layout.tsx`, so unlike the
 * *lab harnesses there is no backend-free route that renders them. Rather than
 * drive the register form in every spec — slow, and it makes an unrelated auth
 * regression fail all of them — we mint the account over HTTP and write the
 * session into `localStorage`, which is what AsyncStorage is backed by on web.
 *
 * The keys below must match `TOKEN_KEY` / `USER_KEY` in `src/context/AuthContext.tsx`.
 * They're duplicated rather than imported because Playwright runs outside the
 * Metro bundler and can't resolve the app's `@/` aliases.
 */
import { expect, type Page } from "@playwright/test";

const TOKEN_KEY = "collaberry.token";
const USER_KEY = "collaberry.user";

/**
 * Where the app itself points. Read from the same env var the app build reads
 * so a spec run can never end up talking to a different backend than the page
 * under test — a mismatch there produces "seeded data doesn't exist" failures
 * that look like app bugs.
 */
export const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080";

export interface SeededUser {
  email: string;
  password: string;
  displayName: string;
  token: string;
  id: string;
}

export interface Column {
  id: string;
  name: string;
  order: number;
}

async function api<T>(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** A fresh account per test. Shared accounts leak state between specs. */
export async function registerUser(displayName = "E2E Tester"): Promise<SeededUser> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collaberry.dev`;
  const password = "e2e-test-password-1";
  const res = await api<{ access_token: string; user: { id: string } }>(
    "/api/v1/auth/register",
    { method: "POST", body: { email, password, display_name: displayName } },
  );
  return { email, password, displayName, token: res.access_token, id: res.user.id };
}

/** The workspace auto-created at registration. */
export async function firstWorkspaceId(user: SeededUser): Promise<string> {
  const list = await api<{ id: string }[]>("/api/v1/workspace/workspaces", { token: user.token });
  if (!list.length) throw new Error("expected a seeded workspace at registration");
  return list[0].id;
}

export async function createBoard(
  user: SeededUser,
  workspaceId: string,
  name: string,
): Promise<{ id: string; columns: Column[] }> {
  return api(`/api/v1/workspace/workspaces/${workspaceId}/boards`, {
    method: "POST",
    token: user.token,
    body: { name },
  });
}

export async function createCard(
  user: SeededUser,
  boardId: string,
  payload: {
    title: string;
    column_id: string;
    tags?: string[];
    assignees?: string[];
    data?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  return api(`/api/v1/workspace/boards/${boardId}/items`, {
    method: "POST",
    token: user.token,
    body: { type: "card", ...payload },
  });
}

export async function addMember(
  owner: SeededUser,
  workspaceId: string,
  userId: string,
): Promise<void> {
  await api(`/api/v1/workspace/workspaces/${workspaceId}/members`, {
    method: "POST",
    token: owner.token,
    body: { user_id: userId, role: "editor" },
  });
}

export async function listNotifications(
  user: SeededUser,
): Promise<{ id: string; title: string; body: string; read: boolean; created_at: string }[]> {
  return api("/api/v1/notifications", { token: user.token });
}

/**
 * Put the session in place *before* the app's first script runs.
 *
 * `addInitScript` rather than a `goto` + `evaluate`: AuthContext reads the token
 * during its boot effect, so writing it after load would race — the app would
 * already have redirected to /login.
 */
export async function signIn(page: Page, user: SeededUser): Promise<void> {
  await page.addInitScript(
    ([tokenKey, userKey, token, userJson]) => {
      window.localStorage.setItem(tokenKey, token);
      window.localStorage.setItem(userKey, userJson);
    },
    [
      TOKEN_KEY,
      USER_KEY,
      user.token,
      JSON.stringify({ id: user.id, email: user.email, display_name: user.displayName }),
    ] as const,
  );
}

/** Land on Home with the shell rendered. */
export async function gotoHome(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("nav-rail")).toBeVisible({ timeout: 20_000 });
}

/** Open a board and wait for its lanes to paint. */
export async function gotoBoard(page: Page, boardId: string, boardName: string): Promise<void> {
  await page.goto(`/board/${boardId}`);
  await expect(page.getByText(boardName).first()).toBeVisible({ timeout: 20_000 });
}

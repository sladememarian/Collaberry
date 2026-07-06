/** Typed endpoint helpers grouped by the service that answers them. */
import { request } from "./client";
import type {
  AppNotification,
  Board,
  Item,
  ItemType,
  TokenResponse,
  UserPublic,
  Workspace,
  WorkspaceContext,
} from "@/types";

// --- auth-service --------------------------------------------------------- //
export const authApi = {
  register: (email: string, password: string, display_name: string) =>
    request<TokenResponse>("/api/v1/auth/register", {
      method: "POST",
      auth: false,
      body: { email, password, display_name },
    }),

  login: (email: string, password: string) =>
    request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    }),

  me: () => request<UserPublic>("/api/v1/auth/me"),

  // Members are added to a workspace by user id, but a human only knows an email;
  // this resolves one to the other so the add-member flow can hand off to addMember.
  userByEmail: (email: string) =>
    request<UserPublic>(`/api/v1/auth/users/by-email?email=${encodeURIComponent(email)}`),
};

// --- workspace-service ---------------------------------------------------- //
export const workspaceApi = {
  list: () => request<Workspace[]>("/api/v1/workspace/workspaces"),

  create: (name: string, context: WorkspaceContext) =>
    request<Workspace>("/api/v1/workspace/workspaces", {
      method: "POST",
      body: { name, context },
    }),

  addMember: (workspaceId: string, userId: string, role: "owner" | "editor" | "viewer") =>
    request<Workspace>(`/api/v1/workspace/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: { user_id: userId, role },
    }),

  listBoards: (workspaceId: string) =>
    request<Board[]>(`/api/v1/workspace/workspaces/${workspaceId}/boards`),

  createBoard: (workspaceId: string, name: string, columns?: string[]) =>
    request<Board>(`/api/v1/workspace/workspaces/${workspaceId}/boards`, {
      method: "POST",
      body: columns ? { name, columns } : { name },
    }),

  getBoard: (boardId: string) => request<Board>(`/api/v1/workspace/boards/${boardId}`),

  listItems: (boardId: string) =>
    request<Item[]>(`/api/v1/workspace/boards/${boardId}/items`),

  createItem: (
    boardId: string,
    payload: {
      type: ItemType;
      title: string;
      column_id: string;
      data?: Record<string, unknown>;
      assignees?: string[];
      tags?: string[];
      due_date?: string | null;
      priority?: number;
    },
  ) =>
    request<Item>(`/api/v1/workspace/boards/${boardId}/items`, {
      method: "POST",
      body: payload,
    }),

  updateItem: (
    itemId: string,
    patch: Partial<{
      title: string;
      column_id: string;
      order: number;
      data: Record<string, unknown>;
      assignees: string[];
      tags: string[];
      due_date: string | null;
      priority: number;
    }>,
  ) => request<Item>(`/api/v1/workspace/items/${itemId}`, { method: "PATCH", body: patch }),

  deleteItem: (itemId: string) =>
    request<void>(`/api/v1/workspace/items/${itemId}`, { method: "DELETE" }),
};

// --- presence-service (REST side; the socket is in realtime/) ------------- //
export const presenceApi = {
  board: (boardId: string) =>
    request<{ board_id: string; users: { user_id: string; display_name: string }[] }>(
      `/api/v1/presence/boards/${boardId}/presence`,
    ),

  lockStatus: (itemId: string) =>
    request<{ locked: boolean; locked_by: string | null; ttl: number }>(
      `/api/v1/presence/items/${itemId}/lock`,
    ),

  acquireLock: (itemId: string) =>
    request<{ granted: boolean; locked_by: string; ttl: number }>(
      `/api/v1/presence/items/${itemId}/lock`,
      { method: "POST" },
    ),

  releaseLock: (itemId: string) =>
    request<{ released: boolean }>(`/api/v1/presence/items/${itemId}/lock`, {
      method: "DELETE",
    }),
};

// --- notification-service ------------------------------------------------- //
export const notificationApi = {
  list: () => request<AppNotification[]>("/api/v1/notifications"),
  markRead: (id: string) =>
    request<AppNotification>(`/api/v1/notifications/${id}/read`, { method: "PATCH" }),
};

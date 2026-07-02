/**
 * Domain types. These mirror the FastAPI Pydantic models 1:1 so the wire format
 * needs no translation layer — what the workspace-service returns is exactly what
 * the UI consumes.
 */

export type WorkspaceContext = "personal" | "university" | "work";
export type MemberRole = "owner" | "editor" | "viewer";
export type ItemType = "card" | "document" | "checklist";

export interface UserPublic {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  user: UserPublic;
}

export interface Member {
  user_id: string;
  role: MemberRole;
}

export interface Workspace {
  id: string;
  name: string;
  context: WorkspaceContext;
  owner_id: string;
  members: Member[];
  created_at: string;
}

/** A Kanban lane. */
export interface Column {
  id: string;
  name: string;
  order: number;
}

export interface Board {
  id: string;
  workspace_id: string;
  name: string;
  columns: Column[];
  created_at: string;
}

// --- Polymorphic item payloads ------------------------------------------- //
export interface ChecklistEntry {
  text: string;
  done: boolean;
}

export type BlockType = "paragraph" | "heading" | "bullet" | "todo" | "code" | "image";

export interface DocumentBlock {
  type: BlockType;
  text: string;
  checked?: boolean | null;
  url?: string | null;
  /** Mirror of the live edit lock — display name of whoever holds this block. */
  locked_by?: string | null;
}

export interface CardData {
  description?: string;
}
export interface DocumentData {
  blocks: DocumentBlock[];
}
export interface ChecklistData {
  entries: ChecklistEntry[];
}

export type ItemData = CardData | DocumentData | ChecklistData | Record<string, unknown>;

/**
 * The single board slot. `type` picks the shape of `data`. This is the
 * "TaskCard" the Kanban board renders and the "document" the block editor opens.
 */
export interface Item {
  id: string;
  board_id: string;
  workspace_id: string;
  column_id: string;
  type: ItemType;
  title: string;
  order: number;
  data: ItemData;
  assignees: string[];
  tags: string[];
  due_date: string | null;
  created_by: string;
  updated_at: string;
}

/** Alias used by the Kanban components to read like the spec. */
export type TaskCard = Item;

export interface AppNotification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  board_id: string | null;
  read: boolean;
  created_at: string;
}

// --- Realtime (presence-service WebSocket frames) ------------------------ //
export interface PresenceUser {
  user_id: string;
  display_name: string;
}

/** The event envelope presence-service relays from Redis (see events.py::BoardEvent). */
export interface BoardEventEnvelope {
  type: string; // EventType value, e.g. "card.created" | "card.moved" | …
  board_id: string;
  workspace_id: string;
  actor_id: string;
  payload: Item; // the affected item, already serialised
  ts: number; // epoch millis, stamped server-side — used to measure fan-out
}

export type ServerFrame =
  | { type: "presence"; users: PresenceUser[] }
  | { type: "typing"; user_id: string; display_name: string }
  | { type: "pong" }
  | { type: "lock_result"; item_id: string; granted: boolean; locked_by: string; ttl: number }
  | { type: "lock_state"; item_id: string; locked_by: string | null; ttl: number }
  | { type: "board_event"; event: BoardEventEnvelope };

/** Normalised event handed to screens by the socket hook. */
export interface BoardChange {
  eventType: string;
  item: Item;
  actorId: string;
  ts: number;
}

export type ClientFrame =
  | { type: "ping" }
  | { type: "typing" }
  | { type: "lock"; item_id: string }
  | { type: "unlock"; item_id: string };

/**
 * The live board. Loads the board + its items, opens a WebSocket to
 * presence-service, and reconciles incoming events (card.created / moved /
 * updated / deleted) into local state so every viewer sees changes land in real
 * time. Creating or moving a card writes through workspace-service, which is the
 * one publisher of those same events — so our own optimistic update and the
 * echoed event agree.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { ApiError } from "@/api/client";
import { workspaceApi } from "@/api/endpoints";
import { AppContainer } from "@/components/AppContainer";
import { ArrowLeftIcon, ChecklistIcon, DocumentIcon, KanbanIcon } from "@/components/icons";
import { DraggableBoard } from "@/components/kanban/DraggableBoard";
import {
  DensityControl,
  DensityProvider,
  usePersistedDensity,
} from "@/components/kanban/density";
import type { ColumnLocks } from "@/components/kanban/KanbanColumn";
import { AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ConnectionDot, EmptyState } from "@/components/ui/EmptyState";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/AuthContext";
import { useBoardSocket } from "@/realtime/useBoardSocket";
import { palette, type WorkspaceContext } from "@/theme/tokens";
import type { Board, BoardChange, Column, Item, ItemType } from "@/types";

export default function BoardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const boardId = String(id);
  const router = useRouter();
  const { token, user, booting } = useAuth();

  const [board, setBoard] = useState<Board | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [context, setContext] = useState<WorkspaceContext>("personal");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"created" | "priority" | "estimation">("created");
  const [density, setDensity] = usePersistedDensity();
  const [deleteTarget, setDeleteTarget] = useState<Column | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Robust back: a board opened via a deep link (or after the item modal ate the
  // history entry) leaves router.back() with nothing to pop on web — it no-ops
  // and the user is stuck. Fall back to Home so the arrow always escapes.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(app)");
  }, [router]);

  // --- realtime ----------------------------------------------------------- //
  const onEvent = useCallback((change: BoardChange) => {
    const it = change.item;
    if (!it || !it.id) return;
    setItems((prev) => {
      switch (change.eventType) {
        case "card.deleted":
          return prev.filter((p) => p.id !== it.id);
        case "card.created":
          return prev.some((p) => p.id === it.id) ? prev : [...prev, it];
        default: // card.updated / card.moved
          return prev.map((p) => (p.id === it.id ? it : p));
      }
    });
  }, []);

  const socket = useBoardSocket({ boardId, token, onEvent });

  // Map presence-service locks (user_id) → display names for the cards.
  const nameByUser = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of socket.presence) m[p.user_id] = p.display_name;
    return m;
  }, [socket.presence]);

  const cardLocks: ColumnLocks = useMemo(() => {
    const out: ColumnLocks = {};
    for (const [itemId, l] of Object.entries(socket.locks)) {
      if (l.lockedBy && l.lockedBy !== user?.id) {
        out[itemId] = nameByUser[l.lockedBy] ?? "Someone";
      }
    }
    return out;
  }, [socket.locks, nameByUser, user?.id]);

  // --- load --------------------------------------------------------------- //
  const load = useCallback(async () => {
    setError(null);
    try {
      const [b, its, wss] = await Promise.all([
        workspaceApi.getBoard(boardId),
        workspaceApi.listItems(boardId),
        workspaceApi.list(),
      ]);
      setBoard(b);
      setItems(its);
      const ws = wss.find((w) => w.id === b.workspace_id);
      if (ws) setContext(ws.context);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't open this board. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    // The auth token is rehydrated from storage asynchronously on app boot;
    // firing this before it lands races the client into sending requests
    // with no JWT yet, which the user sees as a false "Jwt is missing" error.
    if (booting) return;
    load();
  }, [load, booting]);

  // --- create card sheet -------------------------------------------------- //
  const [sheetColumn, setSheetColumn] = useState<Column | null>(null);
  const openAdd = useCallback((column: Column) => setSheetColumn(column), []);
  const [addColumnOpen, setAddColumnOpen] = useState(false);

  const onCardPress = useCallback(
    (item: Item) =>
      router.push({ pathname: "/(app)/item/[id]", params: { id: item.id, boardId } }),
    [router, boardId],
  );

  // Optimistically move a card to another lane, then persist (workspace-service
  // echoes a card.moved event, which reconciles into the same state).
  const moveCard = useCallback(
    (itemId: string, toColumnId: string) => {
      setItems((prev) => prev.map((p) => (p.id === itemId ? { ...p, column_id: toColumnId } : p)));
      workspaceApi.updateItem(itemId, { column_id: toColumnId }).catch(() => load());
    },
    [load],
  );

  // Optimistically reorder lanes, then persist; on failure re-fetch the board.
  const reorderColumns = useCallback(
    (orderedIds: string[]) => {
      setBoard((prev) =>
        prev
          ? { ...prev, columns: prev.columns.map((c) => ({ ...c, order: orderedIds.indexOf(c.id) })) }
          : prev,
      );
      workspaceApi.reorderColumns(boardId, orderedIds).then(setBoard).catch(() => load());
    },
    [boardId, load],
  );

  if (loading) {
    return (
      <AppContainer variant="plain">
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.purple} />
        </View>
      </AppContainer>
    );
  }

  if (error || !board) {
    return (
      <AppContainer variant="plain">
        <BoardHeader title="Board" onBack={goBack} presence={[]} connected={false} />
        <EmptyState title="Can't load this board" body={error ?? undefined} ctaLabel="Try again" onCta={load} />
      </AppContainer>
    );
  }

  return (
    <AppContainer variant="plain">
      <BoardHeader
        title={board.name}
        onBack={goBack}
        presence={socket.presence}
        connected={socket.connected}
      />

      {items.length > 0 ? (
        <View className="flex-row items-center justify-between gap-3 px-4 pb-2 pt-3">
          <SortControl value={sortOrder} onChange={setSortOrder} />
          <DensityControl value={density} onChange={setDensity} />
        </View>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          icon={<KanbanIcon size={26} color={palette.textLow} />}
          title="This board is empty"
          body="Add a card, a document, or a checklist to the first lane."
          ctaLabel="Add a card"
          onCta={() => setSheetColumn(board.columns[0] ?? null)}
        />
      ) : (
        <DensityProvider value={density}>
          <DraggableBoard
            board={board}
            items={items}
            workspaceContext={context}
            locks={cardLocks}
            onCardPress={onCardPress}
            onAddCard={openAdd}
            onAddColumn={() => setAddColumnOpen(true)}
            onMoveCard={moveCard}
            onReorderColumns={reorderColumns}
            onDeleteColumn={(col) => {
              setDeleteError(null);
              setDeleteTarget(col);
            }}
            sortOrder={sortOrder}
          />
        </DensityProvider>
      )}

      <AddItemSheet
        boardId={boardId}
        column={sheetColumn}
        onClose={() => setSheetColumn(null)}
        onCreated={(item) => {
          setItems((prev) => (prev.some((p) => p.id === item.id) ? prev : [...prev, item]));
          setSheetColumn(null);
        }}
      />

      <AddColumnSheet
        boardId={boardId}
        open={addColumnOpen}
        onClose={() => setAddColumnOpen(false)}
        onAdded={(updated) => {
          setBoard(updated);
          setAddColumnOpen(false);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : "Delete this lane?"}
        message={deleteError ?? "This can't be undone."}
        confirmLabel="Delete"
        destructive
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            const updated = await workspaceApi.deleteColumn(boardId, deleteTarget.id);
            setBoard(updated);
            setItems((prev) => prev.filter((it) => it.column_id !== deleteTarget.id));
            setDeleteTarget(null);
            setDeleteError(null);
          } catch (e) {
            setDeleteError(e instanceof ApiError ? e.message : "Couldn't delete this lane. Check your connection and try again.");
          }
        }}
      />
    </AppContainer>
  );
}

// --------------------------------------------------------------------------- //
function BoardHeader({
  title,
  onBack,
  presence,
  connected,
}: {
  title: string;
  onBack: () => void;
  presence: { user_id: string; display_name: string }[];
  connected: boolean;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-ink-border/60 px-4 pb-3 pt-1">
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" accessibilityLabel="Go back" className="h-9 w-9 items-center justify-center rounded-full bg-ink-raised">
        <ArrowLeftIcon size={20} color={palette.textHi} />
      </Pressable>
      <View className="flex-1">
        <Text className="text-h2 font-bold text-text-hi" numberOfLines={1}>
          {title}
        </Text>
        <ConnectionDot connected={connected} />
      </View>
      {presence.length > 0 ? <AvatarStack people={presence} /> : null}
    </View>
  );
}

// --------------------------------------------------------------------------- //
const SORT_OPTIONS: { value: "created" | "priority" | "estimation"; label: string }[] = [
  { value: "created", label: "Created" },
  { value: "priority", label: "Priority" },
  { value: "estimation", label: "Estimation" },
];

/** Segmented control that picks how cards within each lane are ordered. */
function SortControl({
  value,
  onChange,
}: {
  value: "created" | "priority" | "estimation";
  onChange: (value: "created" | "priority" | "estimation") => void;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-meta uppercase text-text-low">Sort</Text>
      <View className="flex-row gap-1.5">
        {SORT_OPTIONS.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityLabel={`Sort by ${o.label}`}
              className="rounded-md border px-2.5 py-1"
              style={{
                borderColor: on ? palette.purple : palette.border,
                backgroundColor: on ? "rgba(168,85,247,0.10)" : "transparent",
              }}
            >
              <Text className="text-meta font-medium" style={{ color: on ? palette.purpleSoft : palette.textMid }}>
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// --------------------------------------------------------------------------- //
const TYPE_OPTIONS: { type: ItemType; label: string; hint: string; icon: (c: string) => React.ReactNode }[] = [
  { type: "card", label: "Task card", hint: "A simple task with a description", icon: (c) => <KanbanIcon size={20} color={c} strokeWidth={1.9} /> },
  { type: "document", label: "Document", hint: "A rich page of blocks", icon: (c) => <DocumentIcon size={20} color={c} strokeWidth={1.9} /> },
  { type: "checklist", label: "Checklist", hint: "A tickable list", icon: (c) => <ChecklistIcon size={20} color={c} strokeWidth={1.9} /> },
];

function AddItemSheet({
  boardId,
  column,
  onClose,
  onCreated,
}: {
  boardId: string;
  column: Column | null;
  onClose: () => void;
  onCreated: (item: Item) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ItemType>("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (column) {
      setTitle("");
      setType("card");
      setError(null);
    }
  }, [column]);

  const submit = async () => {
    if (!column) return;
    if (!title.trim()) return setError("Give it a title.");
    setBusy(true);
    setError(null);
    try {
      const data =
        type === "document"
          ? { blocks: [{ type: "paragraph", text: "" }] }
          : type === "checklist"
            ? { entries: [] }
            : { description: "" };
      const item = await workspaceApi.createItem(boardId, {
        type,
        title: title.trim(),
        column_id: column.id,
        data,
      });
      onCreated(item);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add that card. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={Boolean(column)} onClose={onClose} title={column ? `Add to ${column.name}` : "Add"}>
      <View className="gap-4">
        <TextField label="Title" value={title} onChangeText={setTitle} placeholder="What needs doing?" error={error} />
        <View>
          <Text className="mb-2 text-sub font-medium text-text-mid">Type</Text>
          <View className="gap-2">
            {TYPE_OPTIONS.map((o) => {
              const on = o.type === type;
              return (
                <Pressable
                  key={o.type}
                  onPress={() => setType(o.type)}
                  className="flex-row items-center gap-3 rounded-md border p-3"
                  style={{
                    borderColor: on ? palette.purple : palette.border,
                    backgroundColor: on ? "rgba(168,85,247,0.10)" : "transparent",
                  }}
                >
                  <View className="h-9 w-9 items-center justify-center rounded-md bg-ink-raised">
                    {o.icon(on ? palette.purpleSoft : palette.textMid)}
                  </View>
                  <View className="flex-1">
                    <Text className="text-body font-semibold text-text-hi">{o.label}</Text>
                    <Text className="text-sub text-text-low">{o.hint}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Button label="Add" onPress={submit} loading={busy} full />
      </View>
    </Sheet>
  );
}

// --------------------------------------------------------------------------- //
function AddColumnSheet({
  boardId,
  open,
  onClose,
  onAdded,
}: {
  boardId: string;
  open: boolean;
  onClose: () => void;
  onAdded: (board: Board) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return setError("Name the lane.");
    setBusy(true);
    setError(null);
    try {
      const board = await workspaceApi.addColumn(boardId, name.trim());
      onAdded(board);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't add the lane. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Add a lane">
      <View className="gap-4">
        <TextField
          label="Lane name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Code review, Blocked"
          error={error}
        />
        <Button label="Add lane" onPress={submit} loading={busy} full />
      </View>
    </Sheet>
  );
}

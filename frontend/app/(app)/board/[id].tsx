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
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import type { ColumnLocks } from "@/components/kanban/KanbanColumn";
import { AvatarStack } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
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
  const { token, user } = useAuth();

  const [board, setBoard] = useState<Board | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [context, setContext] = useState<WorkspaceContext>("personal");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(e instanceof ApiError ? e.message : "Couldn't open this board.");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    load();
  }, [load]);

  // --- create card sheet -------------------------------------------------- //
  const [sheetColumn, setSheetColumn] = useState<Column | null>(null);
  const openAdd = useCallback((column: Column) => setSheetColumn(column), []);

  const onCardPress = useCallback(
    (item: Item) =>
      router.push({ pathname: "/(app)/item/[id]", params: { id: item.id, boardId } }),
    [router, boardId],
  );

  if (loading) {
    return (
      <AppContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.purple} />
        </View>
      </AppContainer>
    );
  }

  if (error || !board) {
    return (
      <AppContainer>
        <BoardHeader title="Board" onBack={() => router.back()} presence={[]} connected={false} />
        <EmptyState title="Can't load this board" body={error ?? undefined} ctaLabel="Try again" onCta={load} />
      </AppContainer>
    );
  }

  return (
    <AppContainer>
      <BoardHeader
        title={board.name}
        onBack={() => router.back()}
        presence={socket.presence}
        connected={socket.connected}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<KanbanIcon size={26} color={palette.textLow} />}
          title="This board is empty"
          body="Add a card, a document, or a checklist to the first lane."
          ctaLabel="Add a card"
          onCta={() => setSheetColumn(board.columns[0] ?? null)}
        />
      ) : (
        <KanbanBoard
          board={board}
          items={items}
          workspaceContext={context}
          locks={cardLocks}
          onCardPress={onCardPress}
          onAddCard={openAdd}
        />
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
      <Pressable onPress={onBack} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full bg-ink-raised">
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
      setError(e instanceof ApiError ? e.message : "Couldn't add it.");
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

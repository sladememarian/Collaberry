/**
 * The Kanban surface: horizontally paged columns, each a vertical FlashList.
 *
 * On structural change we call `onDragEnd` — a single seam that the board screen
 * maps onto the workspace-service PATCH (which in turn fans a card.moved event out
 * over Redis → WebSocket to every other viewer). Keeping mutation in one callback
 * means the network/optimistic logic lives in one place, not scattered per card.
 */
import React, { useCallback, useMemo } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";

import type { WorkspaceContext } from "@/theme/tokens";
import type { Board, Column, Item } from "@/types";

import { KanbanColumn, type ColumnLocks } from "./KanbanColumn";

/** Emitted whenever a card's position changes (drag, quick-move, or reorder). */
export interface DragEndPayload {
  itemId: string;
  fromColumnId: string;
  toColumnId: string;
  toIndex: number;
}

export interface KanbanBoardProps {
  board: Board;
  items: Item[];
  workspaceContext: WorkspaceContext;
  /** itemId -> display name of whoever holds the lock (from presence). */
  locks: ColumnLocks;
  onCardPress: (item: Item) => void;
  onAddCard: (column: Column) => void;
  /** Structural mutation seam — wired to PATCH /items/{id} on the screen. */
  onDragEnd?: (payload: DragEndPayload) => void;
}

const GUTTER = 16;

export function KanbanBoard({
  board,
  items,
  workspaceContext,
  locks,
  onCardPress,
  onAddCard,
}: KanbanBoardProps) {
  const { width: screenW } = useWindowDimensions();

  // One column fills a phone; on wide/desktop windows we show ~2.4 columns so the
  // board reads like a real board without cramping.
  const columnWidth = useMemo(() => {
    const usable = screenW - GUTTER * 2;
    if (screenW >= 900) return Math.min(360, (usable - GUTTER * 2) / 2.4);
    if (screenW >= 600) return (usable - GUTTER) / 1.8;
    return usable * 0.86;
  }, [screenW]);

  const columns = useMemo(
    () => [...board.columns].sort((a, b) => a.order - b.order),
    [board.columns],
  );

  const byColumn = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const it of items) (map[it.column_id] ??= []).push(it);
    for (const id of Object.keys(map)) map[id].sort((a, b) => a.order - b.order);
    return map;
  }, [columns, items]);

  const renderColumn = useCallback(
    (col: Column) => (
      <KanbanColumn
        key={col.id}
        column={col}
        items={byColumn[col.id] ?? []}
        workspaceContext={workspaceContext}
        width={columnWidth}
        locks={locks}
        onCardPress={onCardPress}
        onAddCard={onAddCard}
      />
    ),
    [byColumn, workspaceContext, columnWidth, locks, onCardPress, onAddCard],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: GUTTER }}
      // Snap to columns for that tactile board feel on touch devices.
      snapToInterval={columnWidth + 14}
      decelerationRate="fast"
      className="flex-1"
    >
      {columns.map(renderColumn)}
      <View style={{ width: GUTTER }} />
    </ScrollView>
  );
}

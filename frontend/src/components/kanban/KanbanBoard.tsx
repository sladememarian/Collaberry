/**
 * Non-drag Kanban surface (horizontal lanes + vertical card lists).
 * Shares the fit-lane math with DraggableBoard so desktop never loses the
 * Add-lane control off the right edge.
 */
import React, { useCallback, useMemo } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { PlusIcon } from "@/components/icons";
import { palette, type WorkspaceContext } from "@/theme/tokens";
import type { Board, Column, Item } from "@/types";
import {
  BOARD_PAD,
  LANE_GUTTER,
  computeAddLaneWidth,
  computeLaneWidth,
} from "@/utils/laneLayout";

import { KanbanColumn, type ColumnLocks } from "./KanbanColumn";

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
  locks: ColumnLocks;
  onCardPress: (item: Item) => void;
  onAddCard: (column: Column) => void;
  onAddColumn?: () => void;
  onDragEnd?: (payload: DragEndPayload) => void;
}

export function KanbanBoard({
  board,
  items,
  workspaceContext,
  locks,
  onCardPress,
  onAddCard,
  onAddColumn,
}: KanbanBoardProps) {
  const { width: screenW } = useWindowDimensions();

  const columns = useMemo(
    () => [...board.columns].sort((a, b) => a.order - b.order),
    [board.columns],
  );

  const columnWidth = useMemo(
    () => computeLaneWidth(screenW, columns.length),
    [screenW, columns.length],
  );
  const addLaneWidth = useMemo(
    () => computeAddLaneWidth(columnWidth, screenW),
    [columnWidth, screenW],
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
      contentContainerStyle={{
        paddingHorizontal: BOARD_PAD,
        paddingBottom: BOARD_PAD,
        alignItems: "stretch",
      }}
      // Only snap on phones — desktop fit-lane has no overflow to snap against.
      snapToInterval={screenW < 700 ? columnWidth + LANE_GUTTER : undefined}
      decelerationRate="fast"
      className="flex-1"
    >
      {columns.map(renderColumn)}
      {onAddColumn ? (
        <Pressable
          onPress={onAddColumn}
          testID="add-lane"
          style={{ width: addLaneWidth, marginRight: LANE_GUTTER }}
          className="h-24 flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-ink-hair bg-ink-base/30"
          accessibilityLabel="Add a lane"
        >
          <PlusIcon size={16} color={palette.textMid} />
          <Text className="text-sub text-text-low">Add</Text>
        </Pressable>
      ) : null}
      <View style={{ width: BOARD_PAD }} />
    </ScrollView>
  );
}

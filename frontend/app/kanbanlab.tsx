/**
 * Dev-only Kanban harness — NOT part of the product. It renders the real
 * <DraggableBoard> with fully local mock data (no auth, no backend, no
 * websocket) so the drag / scroll / lane-enclosure behaviour can be exercised
 * deterministically by Playwright (see e2e-web/kanban.spec.ts) or by hand at
 * http://localhost:8081/kanbanlab. It lives at the route root, outside the
 * (app) auth guard, and short-circuits to a 404-ish notice outside dev builds
 * so it can never ship as a reachable screen.
 */
import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";

import { AppContainer } from "@/components/AppContainer";
import { DraggableBoard } from "@/components/kanban/DraggableBoard";
import type { Board, Column, Item } from "@/types";

const COLUMN_NAMES = ["Backlog", "In progress", "Code review", "Blocked", "Done"];
// Deliberately lopsided counts: a tall lane (to force vertical scroll) next to
// near-empty lanes (to prove empty tracks still render as visible drop-zones).
const CARD_COUNTS = [14, 6, 3, 0, 1];

function mockColumns(): Column[] {
  return COLUMN_NAMES.map((name, i) => ({ id: `col-${i}`, name, order: i }));
}

function mockItems(columns: Column[]): Item[] {
  const items: Item[] = [];
  columns.forEach((col, ci) => {
    for (let n = 0; n < CARD_COUNTS[ci]; n++) {
      items.push({
        id: `item-${ci}-${n}`,
        board_id: "board-lab",
        workspace_id: "ws-lab",
        column_id: col.id,
        type: "card",
        title: `${col.name} task ${n + 1}`,
        order: n,
        data: { description: "" },
        assignees: [],
        tags: n % 3 === 0 ? ["work"] : [],
        due_date: null,
        priority: n % 4,
        created_by: "lab",
        updated_at: "2026-01-01T00:00:00Z",
      });
    }
  });
  return items;
}

export default function KanbanLab() {
  const initialColumns = useMemo(mockColumns, []);
  const [board, setBoard] = useState<Board>(() => ({
    id: "board-lab",
    workspace_id: "ws-lab",
    name: "Kanban Lab",
    columns: initialColumns,
    created_at: "2026-01-01T00:00:00Z",
  }));
  const [items, setItems] = useState<Item[]>(() => mockItems(initialColumns));

  if (!__DEV__) {
    return (
      <AppContainer>
        <View className="flex-1 items-center justify-center">
          <Text className="text-body text-text-low">Not available.</Text>
        </View>
      </AppContainer>
    );
  }

  const moveCard = (itemId: string, toColumnId: string) =>
    setItems((prev) => prev.map((p) => (p.id === itemId ? { ...p, column_id: toColumnId } : p)));

  const reorderColumns = (orderedIds: string[]) =>
    setBoard((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => ({ ...c, order: orderedIds.indexOf(c.id) })),
    }));

  return (
    <AppContainer>
      {/* testID → data-testid on web (RNW), so Playwright can anchor here. */}
      <View testID="kanbanlab" className="border-b border-ink-border/60 px-4 py-3">
        <Text className="text-h2 font-bold text-text-hi">Kanban Lab</Text>
        <Text className="text-meta uppercase text-text-low">dev harness · mock data</Text>
      </View>
      <DraggableBoard
        board={board}
        items={items}
        workspaceContext="work"
        locks={{}}
        onCardPress={() => {}}
        onAddCard={() => {}}
        onAddColumn={() => {}}
        onMoveCard={moveCard}
        onReorderColumns={reorderColumns}
      />
    </AppContainer>
  );
}

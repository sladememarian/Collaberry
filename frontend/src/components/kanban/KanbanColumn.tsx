/**
 * One vertical lane. Uses FlashList for smooth scrolling even with a few hundred
 * cards — FlashList v2 auto-measures rows, so the win comes from keeping the row
 * renderer (TaskCard) memoised so only changed cards re-render.
 */
import { FlashList } from "@shopify/flash-list";
import React, { useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import { PlusIcon } from "@/components/icons";
import { palette, type WorkspaceContext } from "@/theme/tokens";
import type { Column, Item } from "@/types";
import { LANE_GUTTER } from "@/utils/laneLayout";

import { TaskCard } from "./TaskCard";

export interface ColumnLocks {
  [itemId: string]: string | null; // display name of the locker, or null
}

interface Props {
  column: Column;
  items: Item[];
  workspaceContext: WorkspaceContext;
  width: number;
  locks: ColumnLocks;
  onCardPress: (item: Item) => void;
  onAddCard: (column: Column) => void;
}

function KanbanColumnBase({
  column,
  items,
  workspaceContext,
  width,
  locks,
  onCardPress,
  onAddCard,
}: Props) {
  const renderItem = useCallback(
    ({ item }: { item: Item }) => (
      <TaskCard
        item={item}
        workspaceContext={workspaceContext}
        lockedByName={locks[item.id]}
        onPress={onCardPress}
      />
    ),
    [workspaceContext, locks, onCardPress],
  );

  return (
    <View style={{ width, marginRight: LANE_GUTTER }}>
      <View className="mb-3 flex-row items-center justify-between px-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-h3 font-semibold text-text-hi">{column.name}</Text>
          <View className="rounded-pill bg-ink-raised px-2 py-0.5">
            <Text className="text-meta text-text-low">{items.length}</Text>
          </View>
        </View>
        <Pressable
          onPress={() => onAddCard(column)}
          hitSlop={8}
          className="h-7 w-7 items-center justify-center rounded-full bg-ink-raised"
          accessibilityLabel={`Add card to ${column.name}`}
        >
          <PlusIcon size={16} color={palette.textMid} />
        </Pressable>
      </View>

      <View className="flex-1 rounded-lg border border-ink-border/70 bg-ink-base/40 p-2">
        {items.length === 0 ? (
          <Pressable
            onPress={() => onAddCard(column)}
            className="m-1 items-center justify-center rounded-md border border-dashed border-ink-hair py-8"
          >
            <Text className="text-sub text-text-faint">Drop a card here</Text>
          </Pressable>
        ) : (
          <FlashList
            data={items}
            renderItem={renderItem}
            keyExtractor={(it) => it.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          />
        )}
      </View>
    </View>
  );
}

export const KanbanColumn = React.memo(KanbanColumnBase);

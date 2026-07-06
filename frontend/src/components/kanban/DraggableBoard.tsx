/**
 * The interactive Kanban surface — drag cards between lanes, reorder lanes,
 * add lanes. Motion follows the Collaberry ui-ux-motion skill:
 *
 *  · Tactile lift    — a grabbed card scales up + gains a drop shadow (GPU
 *                       transforms only) so it reads as lifted off the board.
 *  · Fluid shifting  — the lane a card hovers glows and swells open, no abrupt
 *                       layout jumps; neighbouring lanes ease aside on reorder.
 *  · Drop snap       — on release the card springs into place (bouncy spring,
 *                       not a linear slide).
 *
 * Drag is the primary interaction; every move is also reachable through the
 * explicit ◀ ▶ controls on cards and lane headers, so the board stays fully
 * usable on any browser/input even if a pointer-drag misbehaves.
 */
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";

import { ChevronRightIcon, DotGridIcon, PlusIcon } from "@/components/icons";
import { glow, palette, type WorkspaceContext } from "@/theme/tokens";
import type { Board, Column, Item } from "@/types";

import type { ColumnLocks } from "./KanbanColumn";
import { TaskCard } from "./TaskCard";

export interface DraggableBoardProps {
  board: Board;
  items: Item[];
  workspaceContext: WorkspaceContext;
  locks: ColumnLocks;
  onCardPress: (item: Item) => void;
  onAddCard: (column: Column) => void;
  onAddColumn: () => void;
  /** Move a card to the end of another lane. */
  onMoveCard: (itemId: string, toColumnId: string) => void;
  /** Persist a new left-to-right lane order (array of column ids). */
  onReorderColumns: (orderedIds: string[]) => void;
}

const GUTTER = 16;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };

export function DraggableBoard({
  board,
  items,
  workspaceContext,
  locks,
  onCardPress,
  onAddCard,
  onAddColumn,
  onMoveCard,
  onReorderColumns,
}: DraggableBoardProps) {
  const { width: screenW } = useWindowDimensions();

  const columnWidth = useMemo(() => {
    const usable = screenW - GUTTER * 2;
    if (screenW >= 900) return Math.min(340, (usable - GUTTER * 2) / 2.4);
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

  // Page-space x-ranges of each lane, captured on layout, used to hit-test which
  // lane a dragged card is currently over.
  const laneFrames = useRef<Record<string, { x: number; w: number }>>({});
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);

  const setLaneFrame = useCallback((id: string, x: number, w: number) => {
    laneFrames.current[id] = { x, w };
  }, []);

  const resolveColumn = useCallback((pageX: number): string | null => {
    for (const [id, f] of Object.entries(laneFrames.current)) {
      if (pageX >= f.x && pageX <= f.x + f.w) return id;
    }
    return null;
  }, []);

  const moveLane = useCallback(
    (columnId: string, dir: -1 | 1) => {
      const order = columns.map((c) => c.id);
      const i = order.indexOf(columnId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      onReorderColumns(order);
    },
    [columns, onReorderColumns],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: GUTTER }}
      className="flex-1"
    >
      {columns.map((col, index) => (
        <DraggableColumn
          key={col.id}
          column={col}
          index={index}
          count={columns.length}
          prevColumnId={columns[index - 1]?.id ?? null}
          nextColumnId={columns[index + 1]?.id ?? null}
          items={byColumn[col.id] ?? []}
          width={columnWidth}
          workspaceContext={workspaceContext}
          locks={locks}
          isDropTarget={hoverColumn === col.id}
          onCardPress={onCardPress}
          onAddCard={onAddCard}
          onMoveLane={moveLane}
          onMoveCard={onMoveCard}
          onLaneFrame={setLaneFrame}
          onHoverColumn={setHoverColumn}
          resolveColumn={resolveColumn}
        />
      ))}

      {/* Clean, quiet "add lane" affordance — a full-height ghost lane that
          matches the column rhythm instead of a stray floating button. */}
      <Pressable
        onPress={onAddColumn}
        style={{ width: Math.min(160, columnWidth * 0.7) }}
        className="mr-3.5 mt-9 h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-ink-hair bg-ink-base/20"
        accessibilityLabel="Add a lane"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-ink-raised">
          <PlusIcon size={18} color={palette.textMid} />
        </View>
        <Text className="text-sub text-text-low">Add lane</Text>
      </Pressable>

      <View style={{ width: GUTTER }} />
    </ScrollView>
  );
}

// --------------------------------------------------------------------------- //
interface ColumnProps {
  column: Column;
  index: number;
  count: number;
  prevColumnId: string | null;
  nextColumnId: string | null;
  items: Item[];
  width: number;
  workspaceContext: WorkspaceContext;
  locks: ColumnLocks;
  isDropTarget: boolean;
  onCardPress: (item: Item) => void;
  onAddCard: (column: Column) => void;
  onMoveLane: (columnId: string, dir: -1 | 1) => void;
  onMoveCard: (itemId: string, toColumnId: string) => void;
  onLaneFrame: (id: string, x: number, w: number) => void;
  onHoverColumn: (id: string | null) => void;
  resolveColumn: (pageX: number) => string | null;
}

function DraggableColumn({
  column,
  index,
  count,
  prevColumnId,
  nextColumnId,
  items,
  width,
  workspaceContext,
  locks,
  isDropTarget,
  onCardPress,
  onAddCard,
  onMoveLane,
  onMoveCard,
  onLaneFrame,
  onHoverColumn,
  resolveColumn,
}: ColumnProps) {
  // Drop-target lanes glow and swell slightly — the "space opening up" cue.
  const targetStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isDropTarget ? 1.015 : 1, SPRING) }],
    borderColor: withTiming(isDropTarget ? palette.purple : "rgba(35,35,45,0.7)", { duration: 160 }),
  }));

  return (
    <View
      style={{ width }}
      className="mr-3.5"
      onLayout={(e) => {
        // Record page-space x-range for drag hit-testing (measure in window so
        // horizontal scroll offset is already baked in).
        e.currentTarget.measureInWindow((x, _y, w) => onLaneFrame(column.id, x, w));
      }}
    >
      <View className="mb-3 flex-row items-center justify-between px-1">
        <View className="flex-1 flex-row items-center gap-2">
          <Text className="text-h3 font-semibold text-text-hi" numberOfLines={1}>
            {column.name}
          </Text>
          <View className="rounded-pill bg-ink-raised px-2 py-0.5">
            <Text className="text-meta text-text-low">{items.length}</Text>
          </View>
        </View>
        {/* Explicit lane reorder — always works, no matter the input. */}
        <View className="flex-row items-center gap-0.5">
          <LaneNudge disabled={index === 0} rotate onPress={() => onMoveLane(column.id, -1)} />
          <LaneNudge disabled={index === count - 1} onPress={() => onMoveLane(column.id, 1)} />
          <Pressable
            onPress={() => onAddCard(column)}
            hitSlop={8}
            className="ml-1 h-7 w-7 items-center justify-center rounded-full bg-ink-raised"
            accessibilityLabel={`Add card to ${column.name}`}
          >
            <PlusIcon size={16} color={palette.textMid} />
          </Pressable>
        </View>
      </View>

      <Animated.View
        style={[targetStyle, isDropTarget ? glow(palette.purple, 16) : null]}
        className="min-h-[120px] flex-1 rounded-xl border bg-ink-base/40 p-2"
      >
        {items.length === 0 ? (
          <Pressable
            onPress={() => onAddCard(column)}
            className="m-1 flex-1 items-center justify-center rounded-md border border-dashed border-ink-hair py-8"
          >
            <Text className="text-sub text-text-faint">
              {isDropTarget ? "Release to drop here" : "Drop a card here"}
            </Text>
          </Pressable>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {items.map((item) => (
              <DraggableCard
                key={item.id}
                item={item}
                prevColumnId={prevColumnId}
                nextColumnId={nextColumnId}
                workspaceContext={workspaceContext}
                lockedByName={locks[item.id]}
                onPress={onCardPress}
                onMoveCard={onMoveCard}
                onHoverColumn={onHoverColumn}
                resolveColumn={resolveColumn}
              />
            ))}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

function LaneNudge({ onPress, disabled, rotate }: { onPress: () => void; disabled?: boolean; rotate?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={6}
      className="h-7 w-6 items-center justify-center rounded-md"
      style={{ opacity: disabled ? 0.25 : 1 }}
      accessibilityLabel={rotate ? "Move lane left" : "Move lane right"}
    >
      <View style={{ transform: [{ rotate: rotate ? "180deg" : "0deg" }] }}>
        <ChevronRightIcon size={16} color={palette.textMid} />
      </View>
    </Pressable>
  );
}

// --------------------------------------------------------------------------- //
interface CardProps {
  item: Item;
  prevColumnId: string | null;
  nextColumnId: string | null;
  workspaceContext: WorkspaceContext;
  lockedByName?: string | null;
  onPress: (item: Item) => void;
  onMoveCard: (itemId: string, toColumnId: string) => void;
  onHoverColumn: (id: string | null) => void;
  resolveColumn: (pageX: number) => string | null;
}

function DraggableCard({
  item,
  prevColumnId,
  nextColumnId,
  workspaceContext,
  lockedByName,
  onPress,
  onMoveCard,
  onHoverColumn,
  resolveColumn,
}: CardProps) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lifted = useSharedValue(0); // 0 → resting, 1 → grabbed
  const [dragging, setDragging] = useState(false);

  const beginDrag = useCallback(() => setDragging(true), []);
  const endDrag = useCallback(() => {
    setDragging(false);
    onHoverColumn(null);
  }, [onHoverColumn]);

  const commitMove = useCallback(
    (pageX: number) => {
      const target = resolveColumn(pageX);
      if (target && target !== item.column_id) onMoveCard(item.id, target);
    },
    [resolveColumn, item.column_id, item.id, onMoveCard],
  );

  // Long-press to lift (so vertical scroll still works with a quick swipe),
  // then pan. Runs on the JS thread — the board's hit-testing needs JS state.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(160)
        .runOnJS(true)
        .onStart(() => {
          lifted.value = withSpring(1, SPRING);
          beginDrag();
        })
        .onUpdate((e) => {
          tx.value = e.translationX;
          ty.value = e.translationY;
          onHoverColumn(resolveColumn(e.absoluteX));
        })
        .onEnd((e) => {
          commitMove(e.absoluteX);
          // Snap home; if a move happened the card re-renders in its new lane.
          tx.value = withSpring(0, SPRING);
          ty.value = withSpring(0, SPRING);
          lifted.value = withSpring(0, SPRING);
        })
        .onFinalize(() => endDrag()),
    [beginDrag, endDrag, commitMove, onHoverColumn, resolveColumn, tx, ty, lifted],
  );

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: 1 + lifted.value * 0.04 },
    ],
    zIndex: lifted.value > 0 ? 50 : 0,
    shadowColor: "#000",
    shadowOpacity: lifted.value * 0.45,
    shadowRadius: lifted.value * 18,
    shadowOffset: { width: 0, height: lifted.value * 10 },
    opacity: 1 - lifted.value * 0.05,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style} layout={LinearTransition.springify().damping(20)}>
        <TaskCard
          item={item}
          workspaceContext={workspaceContext}
          lockedByName={lockedByName}
          onPress={dragging ? undefined : onPress}
        />
        {/* Quick, guaranteed cross-lane move (works without dragging). */}
        <View className="mt-[-6px] mb-1.5 flex-row justify-end gap-1 px-1">
          <CardNudge disabled={!prevColumnId} rotate onPress={() => prevColumnId && onMoveCard(item.id, prevColumnId)} />
          <CardNudge disabled={!nextColumnId} onPress={() => nextColumnId && onMoveCard(item.id, nextColumnId)} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

function CardNudge({ onPress, disabled, rotate }: { onPress: () => void; disabled?: boolean; rotate?: boolean }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={6}
      className="h-6 w-6 items-center justify-center rounded-md bg-ink-raised/70"
      style={{ opacity: disabled ? 0.2 : 0.9 }}
      accessibilityLabel={rotate ? "Move card to previous lane" : "Move card to next lane"}
    >
      <View style={{ transform: [{ rotate: rotate ? "180deg" : "0deg" }] }}>
        <ChevronRightIcon size={13} color={palette.textMid} />
      </View>
    </Pressable>
  );
}

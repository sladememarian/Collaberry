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
 * Drag is the primary interaction: cards move between lanes by pointer drag,
 * and lanes reorder by press-and-hold on their drag handle.
 */
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";

import { DotGridIcon, PlusIcon, TrashIcon } from "@/components/icons";
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
  /** Delete this lane entirely (caller confirms + surfaces backend errors). */
  onDeleteColumn: (column: Column) => void;
  /** Sort order */
  sortOrder?: 'created' | 'priority' | 'estimation';
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
  onDeleteColumn,
  sortOrder = 'created',
}: DraggableBoardProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();

  // The board's own rendered height (the horizontal ScrollView's viewport).
  // Every lane is sized to exactly this so the vertical card list inside each
  // lane gets a *bounded* height and can therefore establish its own internal
  // scroll region — the crux of the mouse-wheel scroll fix. Seeded from the
  // window height so the very first frame isn't collapsed, then corrected on
  // layout.
  const [viewportH, setViewportH] = useState(0);
  const laneHeight = viewportH || Math.max(screenH - 140, 320);

  const columns = useMemo(
    () => [...board.columns].sort((a, b) => a.order - b.order),
    [board.columns],
  );

  // Lanes always shrink (or grow) to fit every lane on screen at once — add a
  // 5th, 6th, etc. and each lane narrows to make room, so the board keeps
  // filling the viewport instead of overflowing sideways. Only once lanes
  // would get uncomfortably narrow does a floor kick in and the board starts
  // scrolling horizontally from there.
  const columnWidth = useMemo(() => {
    const available = screenW - GUTTER * 2;
    const n = Math.max(columns.length, 1);
    const fitWidth = (available - GUTTER * (n - 1)) / n;
    const floor = screenW >= 900 ? 260 : screenW >= 600 ? 220 : available * 0.75;
    const cap = 420; // one or two lanes shouldn't stretch absurdly wide
    return Math.max(Math.min(fitWidth, cap), floor);
  }, [screenW, columns.length]);

  const byColumn = useMemo(() => {
    const map: Record<string, Item[]> = {};
    for (const col of columns) map[col.id] = [];
    for (const it of items) (map[it.column_id] ??= []).push(it);
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => {
        if (sortOrder === 'priority') return b.priority - a.priority;
        if (sortOrder === 'estimation') return (b.estimation_time ?? 0) - (a.estimation_time ?? 0);
        return a.order - b.order;
      });
    }
    return map;
  }, [columns, items, sortOrder]);

  // Content-space x-ranges of each lane (stable regardless of scroll position),
  // captured on layout, used to hit-test which lane a dragged card or lane is
  // currently over. Gesture coordinates (`e.absoluteX`) come back in page/
  // window space, so resolving a hit also needs the ScrollView's own
  // page-space origin (measured once via ref — the actual RN Web mechanism;
  // measureInWindow lives on the host node, not on layout events) and its live
  // horizontal scroll offset, both tracked below.
  const laneFrames = useRef<Record<string, { x: number; w: number }>>({});
  const scrollRef = useRef<ScrollView>(null);
  const scrollOriginX = useRef(0); // this ScrollView's left edge, in page space
  const scrollOffsetX = useRef(0); // how far the content has scrolled
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);
  // The lane currently being dragged by mouse/touch, if any — its column body
  // gets hidden from hit-testing so it can't hover-target itself.
  const [draggingLane, setDraggingLane] = useState<string | null>(null);

  const setLaneFrame = useCallback((id: string, x: number, w: number) => {
    laneFrames.current[id] = { x, w };
  }, []);

  const measureOrigin = useCallback(() => {
    // `measureInWindow` is attached imperatively to the host node (see
    // react-native-web's usePlatformMethods) — it's not in ScrollView's public
    // TS surface, same as it wasn't on View's onLayout event (the original bug
    // here). Grab it off the actual node instead of the typed ref.
    const node = scrollRef.current as unknown as {
      measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
    } | null;
    node?.measureInWindow?.((x) => {
      scrollOriginX.current = x;
    });
  }, []);

  const onBoardLayout = useCallback(
    (e: LayoutChangeEvent) => {
      measureOrigin();
      const h = e.nativeEvent.layout.height;
      if (h) setViewportH(h);
    },
    [measureOrigin],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetX.current = e.nativeEvent.contentOffset.x;
  }, []);

  const resolveColumn = useCallback(
    (pageX: number, exclude?: string | null): string | null => {
      const contentX = pageX - scrollOriginX.current + scrollOffsetX.current;
      for (const [id, f] of Object.entries(laneFrames.current)) {
        if (id === exclude) continue;
        if (contentX >= f.x && contentX <= f.x + f.w) return id;
      }
      return null;
    },
    [],
  );

  // Drag a lane by mouse/touch and drop it onto another lane's slot to swap it
  // into that position.
  const dropLaneOn = useCallback(
    (draggedId: string, targetId: string) => {
      if (draggedId === targetId) return;
      const order = columns.map((c) => c.id);
      const from = order.indexOf(draggedId);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0) return;
      order.splice(from, 1);
      order.splice(to, 0, draggedId);
      onReorderColumns(order);
    },
    [columns, onReorderColumns],
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onLayout={onBoardLayout}
      contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: 4 }}
      className="flex-1"
    >
      {columns.map((col) => (
        <DraggableColumn
          key={col.id}
          column={col}
          items={byColumn[col.id] ?? []}
          width={columnWidth}
          height={laneHeight}
          workspaceContext={workspaceContext}
          locks={locks}
          isDropTarget={hoverColumn === col.id && draggingLane !== col.id}
          isDragging={draggingLane === col.id}
          onCardPress={onCardPress}
          onAddCard={onAddCard}
          onMoveCard={onMoveCard}
          onDeleteColumn={onDeleteColumn}
          onLaneFrame={setLaneFrame}
          onHoverColumn={setHoverColumn}
          onLaneDragStart={setDraggingLane}
          onLaneDrop={dropLaneOn}
          resolveColumn={resolveColumn}
        />
      ))}

      {/* Clean, quiet "add lane" affordance — a full-height ghost lane that
          matches the column rhythm instead of a stray floating button. */}
      <Pressable
        onPress={onAddColumn}
        style={{ width: Math.min(160, columnWidth * 0.7), height: laneHeight }}
        className="mr-3.5 items-center justify-center gap-2 rounded-xl border border-dashed border-ink-hair bg-ink-base/20"
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
  items: Item[];
  width: number;
  /** Explicit lane height (= the board viewport) so the inner list can scroll. */
  height: number;
  workspaceContext: WorkspaceContext;
  locks: ColumnLocks;
  isDropTarget: boolean;
  isDragging: boolean;
  onCardPress: (item: Item) => void;
  onAddCard: (column: Column) => void;
  onMoveCard: (itemId: string, toColumnId: string) => void;
  onDeleteColumn: (column: Column) => void;
  onLaneFrame: (id: string, x: number, w: number) => void;
  onHoverColumn: (id: string | null) => void;
  onLaneDragStart: (id: string | null) => void;
  onLaneDrop: (draggedId: string, targetId: string) => void;
  resolveColumn: (pageX: number, exclude?: string | null) => string | null;
}

function DraggableColumn({
  column,
  items,
  width,
  height,
  workspaceContext,
  locks,
  isDropTarget,
  isDragging,
  onCardPress,
  onAddCard,
  onMoveCard,
  onDeleteColumn,
  onLaneFrame,
  onHoverColumn,
  onLaneDragStart,
  onLaneDrop,
  resolveColumn,
}: ColumnProps) {
  // Drop-target lanes glow and swell slightly — the "space opening up" cue.
  const targetStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(isDropTarget ? 1.015 : 1, SPRING) }],
    borderColor: withTiming(isDropTarget ? palette.purple : "rgba(35,35,45,0.7)", { duration: 160 }),
  }));

  // A dragged lane lifts off the row (scale + shadow + fade) the same way a
  // dragged card does, and follows the pointer horizontally.
  const laneX = useSharedValue(0);
  const laneLift = useSharedValue(0);

  const laneDropTarget = useCallback(
    (pageX: number) => resolveColumn(pageX, column.id),
    [resolveColumn, column.id],
  );

  const lanePan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(80)
        .runOnJS(true)
        .onStart(() => {
          laneLift.value = withSpring(1, SPRING);
          onLaneDragStart(column.id);
        })
        .onUpdate((e) => {
          laneX.value = e.translationX;
          onHoverColumn(laneDropTarget(e.absoluteX));
        })
        .onEnd((e) => {
          const target = laneDropTarget(e.absoluteX);
          if (target) onLaneDrop(column.id, target);
          laneX.value = withSpring(0, SPRING);
          laneLift.value = withSpring(0, SPRING);
        })
        .onFinalize(() => {
          onLaneDragStart(null);
          onHoverColumn(null);
        }),
    [column.id, laneX, laneLift, onLaneDragStart, onHoverColumn, onLaneDrop, laneDropTarget],
  );

  const laneDragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: laneX.value }, { scale: 1 + laneLift.value * 0.02 }],
    zIndex: laneLift.value > 0 ? 40 : 0,
    // Always a real boxShadow string (never undefined) — reanimated's web
    // style updater passes this straight to a parser that only special-cases
    // the string "none", not undefined/null, and throws otherwise. At rest
    // (lift 0) this just fades the shadow's alpha to 0, which reads the same
    // as no shadow.
    boxShadow: `0px ${laneLift.value * 8}px ${laneLift.value * 24}px rgba(0,0,0,${laneLift.value * 0.4})`,
    opacity: 1 - laneLift.value * 0.08,
  }));

  return (
    // NOTE: NativeWind `className` is dropped on reanimated Animated.View in
    // this setup (plain View/ScrollView keep it) — so every layout-critical
    // style on the two Animated.Views here MUST be inline, not className, or
    // it silently no-ops (this was the real cause of the dead lane scroll).
    <Animated.View
      style={[{ width, height, marginRight: 14 }, laneDragStyle]}
      onLayout={(e) => {
        // Record this lane's content-space x-range (stable regardless of
        // scroll position) straight from the layout event. `resolveColumn`
        // converts an incoming page-space pointer coordinate into this same
        // space using the ScrollView's measured origin + live scroll offset.
        onLaneFrame(column.id, e.nativeEvent.layout.x, e.nativeEvent.layout.width);
      }}
    >
      {/* The whole lane is ONE enclosed track (Gestalt enclosure): a settled,
          slightly-raised surface with a rounded 1px border that visually binds
          the header and the card list into a single cohesive column, so a lane
          always reads as a distinct container/drop-zone — even empty ones —
          instead of cards floating on the black canvas. `height` is explicit
          (the board viewport) which is what finally lets the inner card list
          own a bounded height and scroll on its own. */}
      <Animated.View
        style={[
          {
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            borderWidth: 1,
            borderRadius: 14,
            // Near-opaque raised surface (lighter than the #0A0A0C void) so the
            // lane reads as a solid panel and cards never look like they float
            // on the dotted ambient — on sparse boards the old 0.72 tint let the
            // background bleed through the empty space and read as "darkness".
            // The ambient still breathes through the gutters and page margins.
            backgroundColor: "rgba(20,20,26,0.9)",
          },
          targetStyle, // supplies the (animated) borderColor
          isDropTarget ? glow(palette.purple, 16) : null,
        ]}
      >
        {/* Header, anchored to the top of the track (own tint + hairline
            divider) so it reads as the column's cap, not a floating label. */}
        <View className="flex-row items-center justify-between border-b border-ink-border/70 bg-ink-raised/50 px-2.5 py-2.5">
          <View className="flex-1 flex-row items-center gap-2">
            {/* Drag handle — press-and-hold, then move by mouse or finger to
                reorder this lane among the others. */}
            <GestureDetector gesture={lanePan}>
              <Pressable hitSlop={6} className="mr-0.5 rounded-md p-1" accessibilityLabel={`Drag to reorder ${column.name}`}>
                <DotGridIcon size={16} color={palette.textFaint} />
              </Pressable>
            </GestureDetector>
            <Text className="text-h3 font-semibold text-text-hi" numberOfLines={1}>
              {column.name}
            </Text>
            <View className="rounded-pill bg-ink-raised px-2 py-0.5">
              <Text className="text-meta text-text-low">{items.length}</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-0.5">
            <Pressable
              onPress={() => onDeleteColumn(column)}
              hitSlop={8}
              testID={`delete-column-${column.id}`}
              className="h-7 w-7 items-center justify-center rounded-full bg-ink-raised"
              accessibilityLabel={`Delete ${column.name}`}
            >
              <TrashIcon size={14} color={palette.textFaint} />
            </Pressable>
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

        {/* Body — the actual drop area / scrollable card list. */}
        <View className="flex-1 p-2" style={{ minHeight: 0 }}>
          {isDragging ? (
            <View className="flex-1 items-center justify-center rounded-md border border-dashed border-ink-hair">
              <Text className="text-sub text-text-faint">Drop to place this lane</Text>
            </View>
          ) : items.length === 0 ? (
            <Pressable
              onPress={() => onAddCard(column)}
              className="flex-1 items-center justify-center rounded-md border border-dashed border-ink-hair"
            >
              <Text className="text-sub text-text-faint">
                {isDropTarget ? "Release to drop here" : "Drop a card here"}
              </Text>
            </Pressable>
          ) : (
            // The lane has an explicit height → this View is flex-1 within a
            // bounded parent → the ScrollView gets a real, finite height and
            // can finally establish an internal scroll region. `minHeight: 0`
            // is required at each flex step on web or the child's intrinsic
            // content height wins and the whole thing grows instead of scrolls.
            <ScrollView
              className="flex-1"
              style={{ minHeight: 0 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {items.map((item) => (
                <DraggableCard
                  key={item.id}
                  item={item}
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
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// --------------------------------------------------------------------------- //
interface CardProps {
  item: Item;
  workspaceContext: WorkspaceContext;
  lockedByName?: string | null;
  onPress: (item: Item) => void;
  onMoveCard: (itemId: string, toColumnId: string) => void;
  onHoverColumn: (id: string | null) => void;
  resolveColumn: (pageX: number, exclude?: string | null) => string | null;
}

function DraggableCard({
  item,
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
        .activateAfterLongPress(80)
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

  // PERF: two separate animated styles. `moveStyle` changes on *every* pointer
  // move (tx/ty) but is cheap — just a transform + zIndex. `liftStyle` carries
  // the expensive part (a boxShadow string that reanimated-web must re-parse on
  // each recompute) but depends only on `lifted`, which is constant during the
  // drag itself (it springs once on grab, once on release). Keeping them apart
  // means the shadow string is NOT rebuilt+reparsed on every move — the main
  // cause of drag jank on web, where reanimated runs on the JS thread.
  const moveStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
    zIndex: lifted.value > 0 ? 50 : 0,
  }));

  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lifted.value * 0.04 }],
    // Always a real string (never undefined) — reanimated's web updater feeds
    // this to a parser that only special-cases "none" and throws on nullish.
    // At rest (lifted 0) the alpha just fades to 0, same as no shadow.
    boxShadow: `0px ${lifted.value * 10}px ${lifted.value * 18}px rgba(0,0,0,${lifted.value * 0.45})`,
    opacity: 1 - lifted.value * 0.05,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={moveStyle} layout={LinearTransition.springify().damping(20)}>
        <Animated.View style={liftStyle}>
          <TaskCard
            item={item}
            workspaceContext={workspaceContext}
            lockedByName={lockedByName}
            onPress={dragging ? undefined : onPress}
          />
          {/* Quick, guaranteed cross-lane move (works without dragging). */}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
    );
    }


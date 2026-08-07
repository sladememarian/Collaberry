/**
 * Notifications panel — what's been assigned to you, and what you've read.
 *
 * Unread rows carry a colored rail and a filled dot; read rows fade back and
 * lose both. Marking one read animates the row rather than snapping, because the
 * row doesn't leave the list — without motion, tapping "mark read" on a busy
 * list gives no feedback about which row you just touched.
 *
 * Rows link through to their board when they carry one. Notifications are the
 * main way you learn a task is yours, so a dead-end row would be a strange place
 * for that journey to stop.
 */
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { BellIcon, CheckIcon, ChevronRightIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { DraggableDialog } from "@/components/ui/DraggableDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { useNotifications } from "@/context/NotificationContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { palette } from "@/theme/tokens";
import type { AppNotification } from "@/types";

export function NotificationsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notifications, unreadCount, loading, error, refresh, markRead, markAllRead } =
    useNotifications();
  const router = useRouter();

  // Pull fresh on open — the background poll is a minute wide, and the list you
  // deliberately opened is the one place staleness is unacceptable.
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  return (
    <DraggableDialog
      open={open}
      onClose={onClose}
      title={unreadCount > 0 ? `Notifications · ${unreadCount} unread` : "Notifications"}
      maxWidth={520}
      testID="notifications-panel"
      footer={
        <>
          <Button
            label="Mark all read"
            variant="ghost"
            onPress={markAllRead}
            disabled={unreadCount === 0}
          />
          <Button label="Done" variant="subtle" onPress={onClose} />
        </>
      }
    >
      {loading && notifications.length === 0 ? (
        <View className="items-center py-10">
          <ActivityIndicator color={palette.purple} />
        </View>
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={<BellIcon size={26} color={palette.textLow} />}
          title="Nothing waiting"
          body={
            error ??
            "When someone assigns you a task or a deadline gets close, it shows up here."
          }
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
          <View className="gap-2">
            {notifications.map((n) => (
              <NotificationRow
                key={n.id}
                note={n}
                onMarkRead={() => markRead(n.id)}
                onOpen={
                  n.board_id
                    ? () => {
                        // Reading it is implied by following it — leaving it bold
                        // after you've acted on it is just noise.
                        if (!n.read) markRead(n.id);
                        onClose();
                        router.push(`/(app)/board/${n.board_id}`);
                      }
                    : undefined
                }
              />
            ))}
          </View>
        </ScrollView>
      )}
    </DraggableDialog>
  );
}

function NotificationRow({
  note,
  onMarkRead,
  onOpen,
}: {
  note: AppNotification;
  onMarkRead: () => void;
  onOpen?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  // 1 = unread. Drives the rail, tint and opacity together so the whole row
  // settles in one motion instead of three competing ones.
  const unread = useSharedValue(note.read ? 0 : 1);

  useEffect(() => {
    const target = note.read ? 0 : 1;
    unread.value = reduceMotion ? target : withTiming(target, { duration: 260 });
  }, [note.read, reduceMotion, unread]);

  // Inline style, not className: NativeWind drops className on Animated.View.
  // Only opacity animates here — the unread rail is a separate layer below, so
  // this doesn't have to interpolate a border color per frame.
  const rowStyle = useAnimatedStyle(() => ({
    opacity: 0.62 + unread.value * 0.38,
  }));

  const railStyle = useAnimatedStyle(() => ({ opacity: unread.value }));

  const accent = note.kind === "deadline" ? palette.warn : palette.purple;

  return (
    <Animated.View
      testID={`notification-${note.id}`}
      style={[
        rowStyle,
        {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.surface,
          padding: 12,
          overflow: "hidden",
        },
      ]}
    >
      {/* The unread rail, as its own layer so it can fade independently. */}
      <Animated.View
        style={[
          railStyle,
          {
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            backgroundColor: accent,
          },
        ]}
      />

      <View style={{ paddingTop: 2 }}>
        <BellIcon size={16} color={note.read ? palette.textFaint : accent} />
      </View>

      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        accessibilityRole={onOpen ? "button" : undefined}
        accessibilityLabel={onOpen ? `${note.title} — open board` : undefined}
        className="flex-1"
      >
        <Text
          className="text-body text-text-hi"
          style={{ fontWeight: note.read ? "500" : "700" }}
          numberOfLines={2}
        >
          {note.title}
        </Text>
        {note.body ? (
          <Text className="mt-0.5 text-sub text-text-mid" numberOfLines={3}>
            {note.body}
          </Text>
        ) : null}
        <Text className="mt-1 text-meta text-text-faint">{relativeTime(note.created_at)}</Text>
      </Pressable>

      <View className="items-end gap-1.5">
        {note.read ? (
          <View className="h-7 flex-row items-center gap-1 px-1">
            <CheckIcon size={13} color={palette.success} />
            <Text className="text-meta text-text-faint">Read</Text>
          </View>
        ) : (
          <Pressable
            onPress={onMarkRead}
            accessibilityRole="button"
            accessibilityLabel={`Mark "${note.title}" as read`}
            testID={`mark-read-${note.id}`}
            hitSlop={6}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="h-7 flex-row items-center gap-1 rounded-full border border-ink-hair bg-ink-raised px-2.5"
          >
            <CheckIcon size={12} color={palette.textMid} />
            <Text className="text-meta text-text-mid">Mark read</Text>
          </Pressable>
        )}
        {onOpen ? <ChevronRightIcon size={16} color={palette.textFaint} /> : null}
      </View>
    </Animated.View>
  );
}

/** "3m ago" / "2h ago" / "5d ago" — enough precision for an inbox. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Add / view / delete-your-own comments on an item. Delete is only offered on
 * the current user's own comments — everyone else's just render read-only.
 */
import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { SendIcon, TrashIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { palette } from "@/theme/tokens";
import type { Comment } from "@/types";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function CommentsSection({
  comments,
  currentUserId,
  names,
  onAdd,
  onDelete,
}: {
  comments: Comment[];
  currentUserId: string | undefined;
  names: Record<string, string>;
  onAdd: (body: string) => void;
  onDelete: (commentId: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd(body);
    setDraft("");
  };

  return (
    <View testID="comments-section">
      <Text className="mb-2 text-meta uppercase text-text-low">
        Comments{comments.length ? ` (${comments.length})` : ""}
      </Text>

      <View className="gap-2.5">
        {comments.map((c) => {
          const name = names[c.user_id] ?? "Member";
          const own = c.user_id === currentUserId;
          return (
            <View
              key={c.id}
              testID={`comment-${c.id}`}
              className="flex-row gap-2.5 rounded-md border border-ink-border bg-ink-surface/60 p-3"
            >
              <Avatar name={name} id={c.user_id} size={24} />
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sub font-semibold text-text-hi">{name}</Text>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-meta text-text-faint">{timeAgo(c.created_at)}</Text>
                    {own ? (
                      <Pressable
                        onPress={() => setPendingDelete(c.id)}
                        hitSlop={6}
                        testID={`comment-delete-${c.id}`}
                      >
                        <TrashIcon size={13} color={palette.textFaint} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <Text className="mt-1 text-sub text-text-mid">{c.body}</Text>
              </View>
            </View>
          );
        })}
        {comments.length === 0 ? (
          <Text className="text-sub text-text-faint">No comments yet.</Text>
        ) : null}
      </View>

      <View className="mt-3 flex-row items-center gap-2">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a comment…"
          placeholderTextColor={palette.textFaint}
          onSubmitEditing={submit}
          testID="comment-input"
          className="flex-1 rounded-md border border-ink-border bg-ink-surface/60 p-3 text-body text-text-mid"
        />
        <Pressable
          onPress={submit}
          disabled={!draft.trim()}
          testID="comment-send"
          className="h-10 w-10 items-center justify-center rounded-md bg-ink-raised"
          style={{ opacity: draft.trim() ? 1 : 0.5 }}
        >
          <SendIcon size={16} color={palette.purpleSoft} />
        </Pressable>
      </View>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this comment?"
        message="This can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </View>
  );
}

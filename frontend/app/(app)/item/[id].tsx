/**
 * Item detail — one screen, three shapes. A card shows a description; a checklist
 * shows tickable entries; a document opens the block editor. On open we try to
 * grab the presence-service edit lock; if someone already holds it the screen goes
 * read-only with their name on a banner. Edits autosave (debounced) through
 * workspace-service, which broadcasts the change to everyone else on the board.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { ApiError } from "@/api/client";
import { presenceApi, workspaceApi } from "@/api/endpoints";
import { AppContainer } from "@/components/AppContainer";
import { ArrowLeftIcon, CheckIcon, LockIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Checkbox } from "@/components/editor/blocks/Checkbox";
import {
  DocumentView,
  toEditorBlocks,
  toWireBlocks,
  type EditorBlock,
} from "@/components/editor/DocumentView";
import { ContextBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { useAuth } from "@/context/AuthContext";
import { palette } from "@/theme/tokens";
import type { ChecklistData, ChecklistEntry, DocumentData, Item } from "@/types";

type SaveState = "idle" | "saving" | "saved";

export default function ItemScreen() {
  const { id, boardId } = useLocalSearchParams<{ id: string; boardId?: string }>();
  const itemId = String(id);
  const router = useRouter();
  const { user } = useAuth();

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockedBy, setLockedBy] = useState<string | null>(null); // someone else's name
  const [save, setSave] = useState<SaveState>("idle");

  const readOnly = Boolean(lockedBy);

  // --- load + lock -------------------------------------------------------- //
  useEffect(() => {
    let released = false;
    (async () => {
      try {
        if (!boardId) throw new ApiError(0, null, "Missing board reference.");
        const items = await workspaceApi.listItems(String(boardId));
        const found = items.find((i) => i.id === itemId) ?? null;
        if (!found) throw new ApiError(404, null, "This item no longer exists.");
        setItem(found);

        // Best-effort lock. 423 => held by someone else; anything else, edit freely.
        try {
          await presenceApi.acquireLock(itemId);
        } catch (e) {
          if (e instanceof ApiError && e.status === 423) {
            const d = e.detail as { locked_by?: string } | undefined;
            setLockedBy(d?.locked_by ?? "someone");
          }
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Couldn't open this item.");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      released = true;
      // Release our lock on the way out (ignore failures — the TTL cleans up).
      presenceApi.releaseLock(itemId).catch(() => {});
      void released;
    };
  }, [itemId, boardId]);

  // --- debounced persist -------------------------------------------------- //
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (patch: Parameters<typeof workspaceApi.updateItem>[1]) => {
      if (readOnly) return;
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          const updated = await workspaceApi.updateItem(itemId, patch);
          setItem(updated);
          setSave("saved");
          setTimeout(() => setSave("idle"), 1200);
        } catch {
          setSave("idle");
        }
      }, 550);
    },
    [itemId, readOnly],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (loading) {
    return (
      <AppContainer>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.purple} />
        </View>
      </AppContainer>
    );
  }

  if (error || !item) {
    return (
      <AppContainer>
        <Header onBack={() => router.back()} save="idle" />
        <EmptyState title="Nothing to show" body={error ?? undefined} />
      </AppContainer>
    );
  }

  return (
    <AppContainer edgeToEdge>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <Header onBack={() => router.back()} save={save} onDelete={async () => {
          try {
            await workspaceApi.deleteItem(itemId);
            router.back();
          } catch { /* stay put on failure */ }
        }} />

        <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {lockedBy ? (
            <GlassCard glowColor={palette.purple} className="mb-4 flex-row items-center gap-2.5 p-3" style={{ borderColor: palette.purple }}>
              <LockIcon size={18} color={palette.purpleSoft} />
              <Text className="flex-1 text-sub text-brand-purple-soft">
                {lockedBy} is editing this right now — you're viewing read-only.
              </Text>
            </GlassCard>
          ) : null}

          <View className="mb-3 flex-row items-center gap-2">
            <ContextBadge context={pickContext(item)} />
            <Text className="text-meta uppercase text-text-faint">{item.type}</Text>
          </View>

          {/* Title */}
          <TextInput
            editable={!readOnly}
            defaultValue={item.title}
            onChangeText={(t) => persist({ title: t })}
            placeholder="Untitled"
            placeholderTextColor={palette.textFaint}
            className="text-display text-text-hi"
            multiline
          />

          <View className="my-5 h-px bg-ink-border" />

          {item.type === "card" && <CardBody item={item} readOnly={readOnly} onChange={(desc) => persist({ data: { description: desc } })} />}
          {item.type === "checklist" && <ChecklistBody item={item} readOnly={readOnly} onChange={(entries) => persist({ data: { entries } })} />}
          {item.type === "document" && (
            <DocumentBody
              item={item}
              currentUser={user?.display_name ?? "You"}
              readOnly={readOnly}
              onChange={(blocks) => persist({ data: { blocks } })}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </AppContainer>
  );
}

function pickContext(item: Item): "work" | "university" | "personal" {
  const c = item.tags.find((t) => ["work", "university", "personal"].includes(t.toLowerCase()));
  return (c?.toLowerCase() as "work" | "university" | "personal") ?? "personal";
}

// --------------------------------------------------------------------------- //
function Header({
  onBack,
  save,
  onDelete,
}: {
  onBack: () => void;
  save: SaveState;
  onDelete?: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-4 pb-2 pt-3">
      <Pressable onPress={onBack} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full bg-ink-raised">
        <ArrowLeftIcon size={20} color={palette.textHi} />
      </Pressable>
      <View className="flex-row items-center gap-3">
        <SaveBadge state={save} />
        {onDelete ? (
          <Pressable onPress={onDelete} hitSlop={8} className="h-9 w-9 items-center justify-center rounded-full bg-ink-raised">
            <TrashIcon size={17} color={palette.textMid} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  return (
    <View className="flex-row items-center gap-1.5">
      {state === "saving" ? (
        <ActivityIndicator size="small" color={palette.textLow} />
      ) : (
        <CheckIcon size={14} color={palette.success} />
      )}
      <Text className="text-meta uppercase" style={{ color: state === "saving" ? palette.textLow : palette.success }}>
        {state === "saving" ? "Saving" : "Saved"}
      </Text>
    </View>
  );
}

// --------------------------------------------------------------------------- //
function CardBody({
  item,
  readOnly,
  onChange,
}: {
  item: Item;
  readOnly: boolean;
  onChange: (desc: string) => void;
}) {
  const initial = ((item.data as { description?: string })?.description ?? "") as string;
  return (
    <View>
      <Text className="mb-2 text-meta uppercase text-text-low">Description</Text>
      <TextInput
        editable={!readOnly}
        defaultValue={initial}
        onChangeText={onChange}
        placeholder="Add more detail…"
        placeholderTextColor={palette.textFaint}
        multiline
        className="min-h-[120px] rounded-md border border-ink-border bg-ink-surface/60 p-3.5 text-body text-text-mid"
        style={{ textAlignVertical: "top" }}
      />
    </View>
  );
}

// --------------------------------------------------------------------------- //
function ChecklistBody({
  item,
  readOnly,
  onChange,
}: {
  item: Item;
  readOnly: boolean;
  onChange: (entries: ChecklistEntry[]) => void;
}) {
  const [entries, setEntries] = useState<ChecklistEntry[]>(
    () => (item.data as ChecklistData)?.entries ?? [],
  );

  const commit = useCallback(
    (next: ChecklistEntry[]) => {
      setEntries(next);
      onChange(next);
    },
    [onChange],
  );

  const done = entries.filter((e) => e.done).length;

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-meta uppercase text-text-low">
          {done}/{entries.length} complete
        </Text>
      </View>

      <View className="gap-1.5">
        {entries.map((e, idx) => (
          <View key={idx} className="flex-row items-center gap-3 rounded-md px-1 py-1.5">
            <Checkbox
              checked={e.done}
              disabled={readOnly}
              onToggle={() => commit(entries.map((x, i) => (i === idx ? { ...x, done: !x.done } : x)))}
            />
            <TextInput
              editable={!readOnly}
              defaultValue={e.text}
              onChangeText={(t) => {
                entries[idx] = { ...entries[idx], text: t };
                onChange([...entries]);
              }}
              placeholder="List item"
              placeholderTextColor={palette.textFaint}
              className="flex-1 text-body"
              style={{
                color: e.done ? palette.textFaint : palette.textHi,
                textDecorationLine: e.done ? "line-through" : "none",
              }}
            />
            {!readOnly ? (
              <Pressable onPress={() => commit(entries.filter((_, i) => i !== idx))} hitSlop={6}>
                <Text className="px-1 text-sub text-text-faint">×</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      {!readOnly ? (
        <Pressable
          onPress={() => commit([...entries, { text: "", done: false }])}
          className="mt-3 flex-row items-center gap-2 self-start rounded-md border border-ink-border bg-ink-surface px-3 py-2"
        >
          <PlusIcon size={15} color={palette.textMid} />
          <Text className="text-sub text-text-mid">Add item</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// --------------------------------------------------------------------------- //
function DocumentBody({
  item,
  currentUser,
  readOnly,
  onChange,
}: {
  item: Item;
  currentUser: string;
  readOnly: boolean;
  onChange: (blocks: ReturnType<typeof toWireBlocks>) => void;
}) {
  const [blocks, setBlocks] = useState<EditorBlock[]>(() =>
    toEditorBlocks((item.data as DocumentData)?.blocks ?? []),
  );

  const handle = useCallback(
    (next: EditorBlock[]) => {
      setBlocks(next);
      onChange(toWireBlocks(next));
    },
    [onChange],
  );

  const stats = useMemo(() => {
    const words = blocks.reduce((n, b) => n + (b.text?.trim() ? b.text.trim().split(/\s+/).length : 0), 0);
    return `${blocks.length} blocks · ${words} words`;
  }, [blocks]);

  return (
    <View>
      <Text className="mb-3 text-meta uppercase text-text-low">{stats}</Text>
      <DocumentView blocks={blocks} currentUser={currentUser} editable={!readOnly} onChange={handle} />
    </View>
  );
}

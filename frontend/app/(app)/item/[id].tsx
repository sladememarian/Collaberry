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
import { ArrowLeftIcon, ChecklistIcon, CheckIcon, DocumentIcon, FlagIcon, KanbanIcon, LockIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { Checkbox } from "@/components/editor/blocks/Checkbox";
import {
  DocumentView,
  toEditorBlocks,
  toWireBlocks,
  type EditorBlock,
} from "@/components/editor/DocumentView";
import { ContextBadge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { useAuth } from "@/context/AuthContext";
import { palette } from "@/theme/tokens";
import { PRIORITIES } from "@/theme/priority";
import type { ChecklistData, ChecklistEntry, DocumentData, Item, ItemType } from "@/types";

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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const readOnly = Boolean(lockedBy);

  // Robust back: on web a deep-linked screen has no history, so router.back()
  // silently no-ops. Fall back to the board (or home) so the arrow always works.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else if (boardId) router.replace({ pathname: "/(app)/board/[id]", params: { id: String(boardId) } });
    else router.replace("/(app)");
  }, [router, boardId]);

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

  // --- type switch -------------------------------------------------------- //
  // Changing an item's kind (card ↔ checklist ↔ document) reshapes its data.
  // We carry the text across where it makes sense so a switch isn't destructive,
  // and persist immediately (not debounced) since it's a structural change.
  const changeType = useCallback(
    async (nextType: ItemType) => {
      if (readOnly || !item || item.type === nextType) return;
      const data = convertItemData(item, nextType);
      setSave("saving");
      try {
        const updated = await workspaceApi.updateItem(itemId, { type: nextType, data });
        setItem(updated);
        setSave("saved");
        setTimeout(() => setSave("idle"), 1200);
      } catch {
        setSave("idle");
      }
    },
    [itemId, item, readOnly],
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

  if (error || !item) {
    return (
      <AppContainer>
        <Header onBack={goBack} save="idle" />
        <EmptyState title="Nothing to show" body={error ?? undefined} />
      </AppContainer>
    );
  }

  return (
    <AppContainer edgeToEdge>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        {/* Delete is destructive and irreversible — confirm first ("are you sure?"
            card). A cross-platform dialog because Alert.alert is a no-op on web. */}
        <Header onBack={goBack} save={save} onDelete={readOnly ? undefined : () => setConfirmDelete(true)} />

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

          <TypeSwitcher value={item.type} readOnly={readOnly} onChange={changeType} />
          <PriorityPicker
            value={item.priority}
            readOnly={readOnly}
            onChange={(priority) => {
              setItem((cur) => (cur ? { ...cur, priority } : cur));
              persist({ priority });
            }}
          />
          <View className="mt-4">
            <Text className="mb-2 text-meta uppercase text-text-low">Assignees</Text>
            <View className="flex-row gap-2">
              <TextInput
                editable={!readOnly}
                defaultValue={item.assignees.join(", ")}
                onChangeText={(t) => {
                  const assignees = t.split(",").map((s) => s.trim()).filter(Boolean);
                  persist({ assignees });
                }}
                placeholder="Enter user IDs separated by comma"
                placeholderTextColor={palette.textFaint}
                className="flex-1 rounded-md border border-ink-border bg-ink-surface/60 p-3 text-body text-text-mid"
              />
            </View>
          </View>
          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="mb-2 text-meta uppercase text-text-low">Estimation (hours)</Text>
              <TextInput
                editable={!readOnly}
                defaultValue={item.estimation_time?.toString() ?? ""}
                onChangeText={(t) => {
                  const estimation_time = parseFloat(t);
                  if (!isNaN(estimation_time)) persist({ estimation_time });
                }}
                placeholder="0"
                placeholderTextColor={palette.textFaint}
                keyboardType="numeric"
                className="rounded-md border border-ink-border bg-ink-surface/60 p-3 text-body text-text-mid"
              />
            </View>
          </View>
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

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this item?"
        message="This can't be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          try {
            await workspaceApi.deleteItem(itemId);
            goBack();
          } catch {
            /* stay put on failure */
          }
        }}
      />
    </AppContainer>
  );
}

// --------------------------------------------------------------------------- //
const TYPE_CHOICES: { type: ItemType; label: string; icon: (c: string) => React.ReactNode }[] = [
  { type: "card", label: "Task", icon: (c) => <KanbanIcon size={15} color={c} strokeWidth={1.9} /> },
  { type: "checklist", label: "Checklist", icon: (c) => <ChecklistIcon size={15} color={c} strokeWidth={1.9} /> },
  { type: "document", label: "Document", icon: (c) => <DocumentIcon size={15} color={c} strokeWidth={1.9} /> },
];

/** Segmented control to switch a card ↔ checklist ↔ document in place. */
function TypeSwitcher({
  value,
  readOnly,
  onChange,
}: {
  value: ItemType;
  readOnly: boolean;
  onChange: (type: ItemType) => void;
}) {
  return (
    <View className="mt-4">
      <Text className="mb-2 text-meta uppercase text-text-low">Type</Text>
      <View className="flex-row gap-2">
        {TYPE_CHOICES.map((c) => {
          const on = c.type === value;
          return (
            <Pressable
              key={c.type}
              disabled={readOnly}
              onPress={() => onChange(c.type)}
              className="flex-row items-center gap-1.5 rounded-md border px-3 py-2"
              style={{
                borderColor: on ? palette.purple : palette.border,
                backgroundColor: on ? "rgba(168,85,247,0.10)" : "transparent",
                opacity: readOnly ? 0.5 : 1,
              }}
            >
              {c.icon(on ? palette.purpleSoft : palette.textMid)}
              <Text className="text-sub font-medium" style={{ color: on ? palette.purpleSoft : palette.textMid }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Best-effort reshape of an item's `data` when its type changes, so switching
 * kind doesn't silently drop the user's content. Text is carried across:
 * a card's description ⇆ checklist entries ⇆ document paragraphs.
 */
function convertItemData(item: Item, to: ItemType): Record<string, unknown> {
  const lines = itemTextLines(item);
  if (to === "card") return { description: lines.join("\n") };
  if (to === "checklist") return { entries: lines.filter(Boolean).map((text) => ({ text, done: false })) };
  return { blocks: (lines.length ? lines : [""]).map((text) => ({ type: "paragraph", text })) };
}

/** Flatten any item variant's textual content into plain lines. */
function itemTextLines(item: Item): string[] {
  if (item.type === "card") {
    const d = (item.data as { description?: string })?.description ?? "";
    return d ? d.split("\n") : [];
  }
  if (item.type === "checklist") {
    return ((item.data as ChecklistData)?.entries ?? []).map((e) => e.text).filter(Boolean);
  }
  return ((item.data as DocumentData)?.blocks ?? []).map((b) => b.text ?? "").filter(Boolean);
}

// --------------------------------------------------------------------------- //
/** Inline 3-state (+none) priority selector. Persists on tap. */
function PriorityPicker({
  value,
  readOnly,
  onChange,
}: {
  value: number;
  readOnly: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <View className="mt-4">
      <Text className="mb-2 text-meta uppercase text-text-low">Priority</Text>
      <View className="flex-row gap-2">
        {PRIORITIES.map((p) => {
          const on = p.value === value;
          return (
            <Pressable
              key={p.value}
              disabled={readOnly}
              onPress={() => onChange(p.value)}
              className="flex-row items-center gap-1.5 rounded-md border px-3 py-2"
              style={{
                borderColor: on ? p.color : palette.border,
                backgroundColor: on ? `${p.color}1f` : "transparent",
                opacity: readOnly ? 0.5 : 1,
              }}
            >
              {p.value > 0 ? <FlagIcon size={13} color={on ? p.color : palette.textLow} /> : null}
              <Text className="text-sub font-medium" style={{ color: on ? p.color : palette.textMid }}>
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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

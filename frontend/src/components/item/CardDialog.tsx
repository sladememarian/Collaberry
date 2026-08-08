/**
 * The YouTrack-style card editor: a compact floating panel that opens over the
 * board instead of pushing a route.
 *
 * One component serves both jobs, because they're the same form:
 * - `mode="create"` — blank fields, a type picker, an explicit "Add" action.
 * - `mode="edit"` — hydrated from an existing item, autosaving as you type.
 *
 * Why edit autosaves but create doesn't: an existing card is already real, so a
 * debounced PATCH matches what the full item screen does and what collaborators
 * expect (workspace-service echoes the change over the socket). A card that
 * doesn't exist yet has nothing to PATCH, so it needs a commit point.
 *
 * The full-screen `/item/[id]` route still exists and is still the right place
 * for documents and checklists — those need room. This panel deliberately covers
 * the common case: retitle, repriotise, reassign, adjust dates, edit the
 * description. "Open full view" hands off for anything deeper.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ApiError } from "@/api/client";
import { workspaceApi } from "@/api/endpoints";
import { ChecklistIcon, DocumentIcon, KanbanIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { DraggableDialog } from "@/components/ui/DraggableDialog";
import { PRIORITIES, priorityMeta } from "@/theme/priority";
import { alpha, palette } from "@/theme/tokens";
import type { CardData, Column, Item, ItemType } from "@/types";

type SaveState = "idle" | "saving" | "saved";

const TYPE_OPTIONS: { type: ItemType; label: string; icon: (c: string) => React.ReactNode }[] = [
  { type: "card", label: "Card", icon: (c) => <KanbanIcon size={16} color={c} strokeWidth={1.9} /> },
  { type: "document", label: "Doc", icon: (c) => <DocumentIcon size={16} color={c} strokeWidth={1.9} /> },
  { type: "checklist", label: "List", icon: (c) => <ChecklistIcon size={16} color={c} strokeWidth={1.9} /> },
];

/** Fresh `data` payload for a newly created item of the given type. */
function blankData(type: ItemType) {
  if (type === "document") return { blocks: [{ type: "paragraph", text: "" }] };
  if (type === "checklist") return { entries: [] };
  return { description: "" };
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Create mode: the lane the new item lands in. */
  column?: Column | null;
  boardId: string;
  /** Edit mode: the item being edited. */
  item?: Item | null;
  /** Someone else holds the edit lock — panel goes read-only with their name. */
  lockedBy?: string | null;
  onCreated?: (item: Item) => void;
  onUpdated?: (item: Item) => void;
  /** Hand off to the full `/item/[id]` screen. */
  onOpenFull?: (item: Item) => void;
}

export function CardDialog({
  open,
  onClose,
  column,
  boardId,
  item,
  lockedBy,
  onCreated,
  onUpdated,
  onOpenFull,
}: Props) {
  const mode: "create" | "edit" = item ? "edit" : "create";
  const readOnly = Boolean(lockedBy);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState(0);
  const [estimation, setEstimation] = useState("");
  const [type, setType] = useState<ItemType>("card");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>("idle");

  // Hydrate on open. Keyed on the item id so switching cards without closing
  // the panel reloads the fields rather than showing the previous card's values.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSave("idle");
    if (item) {
      setTitle(item.title);
      setDescription((item.data as CardData)?.description ?? "");
      setPriority(item.priority ?? 0);
      setEstimation(item.estimation_time != null ? String(item.estimation_time) : "");
      setType(item.type);
    } else {
      setTitle("");
      setDescription("");
      setPriority(0);
      setEstimation("");
      setType("card");
    }
  }, [open, item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- edit mode: debounced autosave -------------------------------------- //
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(
    (patch: Parameters<typeof workspaceApi.updateItem>[1]) => {
      if (mode !== "edit" || !item || readOnly) return;
      setSave("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          const updated = await workspaceApi.updateItem(item.id, patch);
          onUpdated?.(updated);
          setSave("saved");
          setTimeout(() => setSave("idle"), 1200);
        } catch {
          // Leave the field as the user typed it — losing their text to a
          // failed request is worse than a stale server value.
          setSave("idle");
        }
      }, 550);
    },
    [mode, item, readOnly, onUpdated],
  );

  // Flush any pending save when the panel closes, so a change typed a moment
  // before dismissing isn't silently dropped by the debounce.
  useEffect(() => {
    if (open || !timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, [open]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // --- create mode: explicit commit --------------------------------------- //
  const submit = async () => {
    if (!column) return;
    if (!title.trim()) return setError("Give it a title.");
    setBusy(true);
    setError(null);
    try {
      const created = await workspaceApi.createItem(boardId, {
        type,
        title: title.trim(),
        column_id: column.id,
        data: blankData(type),
        ...(priority ? { priority } : {}),
        ...(estimation.trim() ? { estimation_time: Number(estimation) } : {}),
      });
      // A doc or checklist created here has no body yet, so send the user
      // straight to the full editor where they can actually fill it in.
      if (type !== "card") onOpenFull?.(created);
      onCreated?.(created);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "Couldn't add that card. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const dialogTitle =
    mode === "edit" ? "Edit card" : column ? `Add to ${column.name}` : "New card";

  return (
    <DraggableDialog
      open={open}
      onClose={onClose}
      title={dialogTitle}
      testID="card-dialog"
      accent={priorityMeta(priority).color}
      headerAccessory={<SaveBadge state={save} lockedBy={lockedBy} />}
      footer={
        mode === "create" ? (
          <>
            <Button label="Cancel" variant="ghost" onPress={onClose} />
            <Button label="Add" onPress={submit} loading={busy} />
          </>
        ) : item && onOpenFull ? (
          <>
            <Button label="Open full view" variant="ghost" onPress={() => onOpenFull(item)} />
            <Button label="Done" onPress={onClose} />
          </>
        ) : null
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ gap: 14 }}
      >
        {lockedBy ? (
          <View className="rounded-md border border-state-warn/40 bg-state-warn/10 px-3 py-2">
            <Text className="text-sub text-state-warn">
              {lockedBy} is editing this card. You're viewing a read-only copy.
            </Text>
          </View>
        ) : null}

        <Field label="Title">
          <TextInput
            value={title}
            editable={!readOnly}
            onChangeText={(v) => {
              setTitle(v);
              if (v.trim()) persist({ title: v.trim() });
            }}
            placeholder="What needs doing?"
            placeholderTextColor={palette.textFaint}
            className="rounded-md border border-ink-border bg-ink-raised px-3 py-2.5 text-body text-text-hi"
            style={{ outlineStyle: "none" } as object}
          />
        </Field>

        {mode === "create" ? (
          <Field label="Type">
            <View className="flex-row gap-2">
              {TYPE_OPTIONS.map((o) => {
                const on = o.type === type;
                return (
                  <Pressable
                    key={o.type}
                    onPress={() => setType(o.type)}
                    accessibilityRole="button"
                    accessibilityLabel={o.label}
                    className="flex-1 flex-row items-center justify-center gap-1.5 rounded-md border py-2"
                    style={{
                      borderColor: on ? palette.purple : palette.border,
                      backgroundColor: on ? alpha(palette.purple, 0.1) : "transparent",
                    }}
                  >
                    {o.icon(on ? palette.purpleSoft : palette.textMid)}
                    <Text
                      className="text-sub font-medium"
                      style={{ color: on ? palette.purpleSoft : palette.textMid }}
                    >
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
        ) : null}

        {/* Description only applies to plain cards — a doc's body lives in
            blocks and a checklist's in entries, both of which need the full
            screen. */}
        {type === "card" ? (
          <Field label="Description">
            <TextInput
              value={description}
              editable={!readOnly}
              onChangeText={(v) => {
                setDescription(v);
                persist({ data: { description: v } });
              }}
              placeholder="Add detail…"
              placeholderTextColor={palette.textFaint}
              multiline
              className="rounded-md border border-ink-border bg-ink-raised px-3 py-2.5 text-body text-text-hi"
              style={{ minHeight: 88, textAlignVertical: "top", outlineStyle: "none" } as object}
            />
          </Field>
        ) : null}

        <Field label="Priority">
          <View className="flex-row gap-2">
            {PRIORITIES.map((p) => {
              const on = p.value === priority;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => {
                    if (readOnly) return;
                    setPriority(p.value);
                    persist({ priority: p.value });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Priority ${p.label}`}
                  className="flex-1 items-center rounded-md border py-2"
                  style={{
                    borderColor: on ? p.color : palette.border,
                    backgroundColor: on ? alpha(p.color, 0.1) : "transparent",
                  }}
                >
                  <Text
                    className="text-sub font-semibold"
                    style={{ color: on ? p.color : palette.textMid }}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Field>

        <Field label="Estimation (hours)">
          <TextInput
            value={estimation}
            editable={!readOnly}
            onChangeText={(v) => {
              // Digits and a single decimal point only — the backend wants a
              // number, and letting "3 days" through just produces a 422.
              const clean = v.replace(/[^0-9.]/g, "");
              setEstimation(clean);
              const n = Number(clean);
              if (clean === "") persist({ estimation_time: null });
              else if (!Number.isNaN(n)) persist({ estimation_time: n });
            }}
            placeholder="e.g. 4"
            placeholderTextColor={palette.textFaint}
            keyboardType="decimal-pad"
            className="rounded-md border border-ink-border bg-ink-raised px-3 py-2.5 text-body text-text-hi"
            style={{ outlineStyle: "none" } as object}
          />
        </Field>

        {error ? <Text className="text-sub text-state-danger">{error}</Text> : null}
      </ScrollView>
    </DraggableDialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="mb-1.5 text-sub font-medium text-text-mid">{label}</Text>
      {children}
    </View>
  );
}

/** Quiet autosave indicator, so edit mode doesn't need a Save button. */
function SaveBadge({ state, lockedBy }: { state: SaveState; lockedBy?: string | null }) {
  if (lockedBy) return null;
  if (state === "saving") {
    return (
      <View className="flex-row items-center gap-1.5">
        <ActivityIndicator size="small" color={palette.textLow} />
        <Text className="text-meta text-text-low">Saving</Text>
      </View>
    );
  }
  if (state === "saved") {
    return <Text className="text-meta text-state-success">Saved</Text>;
  }
  return null;
}

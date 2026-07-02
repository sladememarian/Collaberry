/**
 * Polymorphic document editor. A document is an ordered array of blocks; each
 * block renders a different control based on its `type`. All edits are local
 * (useState) and bubble up through `onChange` so the screen can debounce-persist
 * to workspace-service.
 *
 * Collaborative guardrail: a block whose `locked_by` names *someone else* gets a
 * glowing purple rim and becomes read-only — this simulates the Redis live-lock
 * that presence-service hands out. Your own locks read as "you're editing".
 */
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import {
  ChecklistIcon,
  DocumentIcon,
  ImageIcon,
  LockIcon,
  PlusIcon,
} from "@/components/icons";
import { glow, palette } from "@/theme/tokens";
import type { BlockType, DocumentBlock } from "@/types";

import { Checkbox } from "./blocks/Checkbox";
import { ImageBlock } from "./blocks/ImageBlock";

export interface EditorBlock extends DocumentBlock {
  /** Stable client key — the wire format has no id, so we mint one locally. */
  _key: string;
}

let seq = 0;
const mintKey = () => `b${Date.now().toString(36)}${(seq++).toString(36)}`;

export function toEditorBlocks(blocks: DocumentBlock[]): EditorBlock[] {
  return blocks.map((b) => ({ ...b, _key: mintKey() }));
}
export function toWireBlocks(blocks: EditorBlock[]): DocumentBlock[] {
  return blocks.map(({ _key, ...rest }) => rest);
}

interface Props {
  blocks: EditorBlock[];
  currentUser: string;
  editable?: boolean;
  onChange: (next: EditorBlock[]) => void;
  onFocusBlock?: (block: EditorBlock) => void;
}

export function DocumentView({
  blocks,
  currentUser,
  editable = true,
  onChange,
  onFocusBlock,
}: Props) {
  const patch = useCallback(
    (key: string, changes: Partial<EditorBlock>) =>
      onChange(blocks.map((b) => (b._key === key ? { ...b, ...changes } : b))),
    [blocks, onChange],
  );

  const addBlock = useCallback(
    (type: BlockType) => {
      const fresh: EditorBlock = {
        _key: mintKey(),
        type,
        text: "",
        checked: type === "todo" ? false : null,
        url: type === "image" ? "" : null,
        locked_by: null,
      };
      onChange([...blocks, fresh]);
    },
    [blocks, onChange],
  );

  const removeBlock = useCallback(
    (key: string) => onChange(blocks.filter((b) => b._key !== key)),
    [blocks, onChange],
  );

  return (
    <View className="gap-2">
      {blocks.map((block) => (
        <BlockRow
          key={block._key}
          block={block}
          currentUser={currentUser}
          editable={editable}
          onPatch={(c) => patch(block._key, c)}
          onRemove={() => removeBlock(block._key)}
          onFocus={() => onFocusBlock?.(block)}
        />
      ))}

      <AddBlockBar onAdd={addBlock} disabled={!editable} />
    </View>
  );
}

// --------------------------------------------------------------------------- //
function BlockRow({
  block,
  currentUser,
  editable,
  onPatch,
  onRemove,
  onFocus,
}: {
  block: EditorBlock;
  currentUser: string;
  editable: boolean;
  onPatch: (c: Partial<EditorBlock>) => void;
  onRemove: () => void;
  onFocus: () => void;
}) {
  const lockedByOther = Boolean(block.locked_by && block.locked_by !== currentUser);
  const lockedByMe = block.locked_by === currentUser && Boolean(block.locked_by);
  const canEdit = editable && !lockedByOther;

  return (
    <View
      className="rounded-md"
      style={
        lockedByOther
          ? [{ borderWidth: 1.4, borderColor: palette.purple, padding: 8 }, glow(palette.purple, 14)]
          : { padding: 2 }
      }
    >
      {(lockedByOther || lockedByMe) && (
        <View className="mb-1 flex-row items-center gap-1.5 px-1">
          <LockIcon size={12} color={lockedByOther ? palette.purpleSoft : palette.textLow} />
          <Text
            className="text-meta"
            style={{ color: lockedByOther ? palette.purpleSoft : palette.textLow }}
          >
            {lockedByOther ? `${block.locked_by} is editing` : "You're editing"}
          </Text>
        </View>
      )}

      <BlockBody block={block} canEdit={canEdit} onPatch={onPatch} onFocus={onFocus} />

      {canEdit && (
        <Pressable
          onPress={onRemove}
          hitSlop={6}
          className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full"
        >
          <Text className="text-sub text-text-faint">×</Text>
        </Pressable>
      )}
    </View>
  );
}

function BlockBody({
  block,
  canEdit,
  onPatch,
  onFocus,
}: {
  block: EditorBlock;
  canEdit: boolean;
  onPatch: (c: Partial<EditorBlock>) => void;
  onFocus: () => void;
}) {
  const common = {
    editable: canEdit,
    onFocus,
    placeholderTextColor: palette.textFaint,
    multiline: true,
  } as const;

  switch (block.type) {
    case "heading":
      return (
        <TextInput
          {...common}
          value={block.text}
          onChangeText={(t) => onPatch({ text: t })}
          placeholder="Heading"
          className="text-h1 font-bold text-text-hi"
          style={{ paddingVertical: 4 }}
        />
      );

    case "paragraph":
      return (
        <TextInput
          {...common}
          value={block.text}
          onChangeText={(t) => onPatch({ text: t })}
          placeholder="Write something…"
          className="text-body text-text-mid"
          style={{ paddingVertical: 2, minHeight: 24 }}
        />
      );

    case "bullet":
      return (
        <View className="flex-row items-start gap-2 pl-1">
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: palette.textLow, marginTop: 9 }} />
          <TextInput
            {...common}
            value={block.text}
            onChangeText={(t) => onPatch({ text: t })}
            placeholder="List item"
            className="flex-1 text-body text-text-mid"
          />
        </View>
      );

    case "todo": {
      const done = Boolean(block.checked);
      return (
        <View className="flex-row items-center gap-2.5 pl-1">
          <Checkbox checked={done} disabled={!canEdit} onToggle={() => onPatch({ checked: !done })} />
          <TextInput
            {...common}
            value={block.text}
            onChangeText={(t) => onPatch({ text: t })}
            placeholder="To-do"
            className="flex-1 text-body"
            style={{
              color: done ? palette.textFaint : palette.textHi,
              textDecorationLine: done ? "line-through" : "none",
            }}
          />
        </View>
      );
    }

    case "code":
      return (
        <View className="rounded-md border border-ink-border bg-ink-void px-3 py-2">
          <TextInput
            {...common}
            value={block.text}
            onChangeText={(t) => onPatch({ text: t })}
            placeholder="// code"
            className="text-sub text-brand-cyan"
            style={{ fontFamily: "monospace" as const }}
          />
        </View>
      );

    case "image":
      return (
        <View>
          <ImageBlock url={block.url} caption={block.text} />
          {canEdit && (
            <TextInput
              editable={canEdit}
              onFocus={onFocus}
              value={block.url ?? ""}
              onChangeText={(t) => onPatch({ url: t })}
              placeholder="Paste image URL…"
              placeholderTextColor={palette.textFaint}
              className="mt-1 rounded-sm bg-ink-raised px-2.5 py-2 text-sub text-text-mid"
            />
          )}
        </View>
      );

    default:
      return null;
  }
}

// --------------------------------------------------------------------------- //
function AddBlockBar({
  onAdd,
  disabled,
}: {
  onAdd: (t: BlockType) => void;
  disabled?: boolean;
}) {
  const options = useMemo(
    () =>
      [
        { type: "paragraph" as const, label: "Text", icon: <DocumentIcon size={16} color={palette.textMid} strokeWidth={1.8} /> },
        { type: "heading" as const, label: "Heading", icon: <Text className="text-body font-bold text-text-mid">H</Text> },
        { type: "todo" as const, label: "To-do", icon: <ChecklistIcon size={16} color={palette.textMid} strokeWidth={1.8} /> },
        { type: "image" as const, label: "Image", icon: <ImageIcon size={16} color={palette.textMid} strokeWidth={1.8} /> },
      ],
    [],
  );

  if (disabled) return null;

  return (
    <View className="mt-2 flex-row flex-wrap gap-2">
      {options.map((o) => (
        <Pressable
          key={o.type}
          onPress={() => onAdd(o.type)}
          className="flex-row items-center gap-1.5 rounded-md border border-ink-border bg-ink-surface px-2.5 py-1.5"
        >
          {o.icon}
          <Text className="text-sub text-text-mid">{o.label}</Text>
        </Pressable>
      ))}
      <View className="flex-row items-center gap-1 rounded-md px-1.5 py-1.5">
        <PlusIcon size={13} color={palette.textFaint} />
        <Text className="text-meta text-text-faint">add block</Text>
      </View>
    </View>
  );
}

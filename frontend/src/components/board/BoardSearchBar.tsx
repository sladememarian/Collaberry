/**
 * Board search — filters the lanes by card title, tags and description.
 *
 * Deliberately an inline bar, not a dialog. Every other panel in this app floats
 * over the board, but search is the one case where that's wrong: the result of
 * the search *is* the board behind it, and a dimmed backdrop would hide the
 * thing you're looking at. So this docks under the header and pushes nothing
 * around when it closes (it's simply unmounted).
 *
 * `matchCount` is passed in rather than computed here because the board owns the
 * item list and already has the filtered array — recomputing would mean shipping
 * the matcher two places and letting them drift.
 */
import React, { useEffect, useRef } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import { CloseIcon, SearchIcon } from "@/components/icons";
import { palette } from "@/theme/tokens";
import type { Item } from "@/types";

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  matchCount: number;
  totalCount: number;
}

export function BoardSearchBar({
  query,
  onQueryChange,
  onClose,
  matchCount,
  totalCount,
}: Props) {
  const inputRef = useRef<TextInput>(null);

  // Opening search and then having to click the field would make the rail entry
  // a two-step action for no reason.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  // Escape closes search, web only — the same grammar every other dismissible
  // surface here uses. Bound on the window rather than the input's own key
  // handler: focus starts on a timer above and moves away the moment you click
  // a card or a lane, and an Escape that only works while the field happens to
  // hold focus is an Escape that silently doesn't.
  //
  // Capture phase, not bubble: with focus inside the field, something between
  // the input and the document swallows the keydown on the way back up, so a
  // bubble-phase listener here never runs. Capture sees it on the way down.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <View className="flex-row items-center gap-2.5 px-4 pb-1 pt-3">
      <View
        className="h-11 flex-1 flex-row items-center gap-2.5 rounded-md bg-ink-raised px-3.5"
        style={{ borderWidth: 1, borderColor: palette.purple }}
      >
        <SearchIcon size={17} color={palette.purple} />
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search titles, tags, descriptions…"
          placeholderTextColor={palette.textFaint}
          className="flex-1 text-body text-text-hi"
          style={{ paddingVertical: 0 }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          testID="board-search-input"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => onQueryChange("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            testID="board-search-clear"
          >
            <CloseIcon size={15} color={palette.textMid} />
          </Pressable>
        ) : null}
      </View>

      <Text
        className="text-meta"
        // Zero matches turns amber: the lanes behind this bar go empty, and
        // without a signal here that reads as "my cards are gone".
        style={{
          color: query.trim() && matchCount === 0 ? palette.warn : palette.textLow,
        }}
        testID="board-search-count"
      >
        {query.trim().length === 0
          ? `${totalCount} cards`
          : matchCount === 0
            ? "No matches"
            : matchCount === 1
              ? "1 match"
              : `${matchCount} matches`}
      </Text>

      <Pressable
        onPress={onClose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Close search"
        testID="board-search-close"
        className="h-8 w-8 items-center justify-center rounded-full bg-ink-raised"
      >
        <CloseIcon size={16} color={palette.textMid} />
      </Pressable>
    </View>
  );
}

/**
 * Match on everything a card visibly carries: its title, its tags, and its
 * body text. Searching only titles would miss the card you remember by a phrase
 * in its description, which is the case where search earns its keep.
 *
 * Case-insensitive substring, not fuzzy — a board holds tens of cards, not
 * thousands, and predictable beats clever at that size.
 */
export function itemMatches(item: Item, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (item.title.toLowerCase().includes(q)) return true;
  if (item.tags.some((t) => t.toLowerCase().includes(q))) return true;

  const data = item.data as Record<string, unknown>;

  // Card bodies.
  if (typeof data.description === "string" && data.description.toLowerCase().includes(q)) {
    return true;
  }
  // Document blocks.
  if (Array.isArray(data.blocks)) {
    for (const b of data.blocks) {
      const text = (b as { text?: unknown }).text;
      if (typeof text === "string" && text.toLowerCase().includes(q)) return true;
    }
  }
  // Checklist entries.
  if (Array.isArray(data.entries)) {
    for (const e of data.entries) {
      const text = (e as { text?: unknown }).text;
      if (typeof text === "string" && text.toLowerCase().includes(q)) return true;
    }
  }
  return false;
}

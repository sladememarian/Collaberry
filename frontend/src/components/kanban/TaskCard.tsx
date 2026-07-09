/**
 * A single card on the board. Reads its type (card / document / checklist) and
 * shows a fitting glyph, the glowing context badge, assignees, and a due chip.
 * If presence-service reports a lock, a purple rim + a small lock glyph appear.
 */
import React, { memo } from "react";
import { Text, View } from "react-native";

import { ChecklistIcon, DocumentIcon, FlagIcon, KanbanIcon, LockIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { ContextBadge, TagChip } from "@/components/ui/Badge";
import { GlassCard } from "@/components/ui/GlassCard";
import { priorityMeta } from "@/theme/priority";
import { contextAccent, palette, type WorkspaceContext } from "@/theme/tokens";
import type { ChecklistData, Item } from "@/types";

const CONTEXTS: WorkspaceContext[] = ["work", "university", "personal"];

/** A card's context comes from a matching tag, else the workspace it lives in. */
export function cardContext(item: Item, fallback: WorkspaceContext): WorkspaceContext {
  const tagged = item.tags.find((t) => CONTEXTS.includes(t.toLowerCase() as WorkspaceContext));
  return (tagged?.toLowerCase() as WorkspaceContext) ?? fallback;
}

function TypeGlyph({ type, color }: { type: Item["type"]; color: string }) {
  if (type === "document") return <DocumentIcon size={15} color={color} strokeWidth={1.8} />;
  if (type === "checklist") return <ChecklistIcon size={15} color={color} strokeWidth={1.8} />;
  return <KanbanIcon size={15} color={color} strokeWidth={1.8} />;
}

function checklistProgress(item: Item): { done: number; total: number } | null {
  if (item.type !== "checklist") return null;
  const entries = (item.data as ChecklistData)?.entries ?? [];
  return { done: entries.filter((e) => e.done).length, total: entries.length };
}

function dueLabel(due: string | null): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const d = new Date(due);
  const now = new Date();
  const days = Math.round((d.getTime() - now.getTime()) / 86_400_000);
  const overdue = d.getTime() < now.getTime();
  const text =
    days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : overdue ? `${-days}d late` : `${days}d`;
  return { text, overdue };
}

interface Props {
  item: Item;
  workspaceContext: WorkspaceContext;
  lockedByName?: string | null;
  onPress?: (item: Item) => void;
}

function TaskCardBase({ item, workspaceContext, lockedByName, onPress }: Props) {
  const ctx = cardContext(item, workspaceContext);
  const accent = contextAccent[ctx];
  const progress = checklistProgress(item);
  const due = dueLabel(item.due_date);
  const locked = Boolean(lockedByName);

  return (
    <GlassCard
      onPress={() => onPress?.(item)}
      glowColor={locked ? palette.purple : undefined}
      className="mb-2.5 p-3"
      style={locked ? { borderColor: palette.purple } : undefined}
    >
      {/* Accent hairline strip on the left edge for quick scanning. */}
      <View
        style={{ backgroundColor: accent.color }}
        className="absolute left-0 top-3 h-8 w-1 rounded-r"
      />

      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <TypeGlyph type={item.type} color={accent.color} />
          <ContextBadge context={ctx} />
          {item.priority > 0 ? <PriorityPip priority={item.priority} /> : null}
        </View>
        {locked ? (
          <View className="flex-row items-center gap-1">
            <LockIcon size={13} color={palette.purpleSoft} />
            <Text className="text-meta text-brand-purple-soft" numberOfLines={1}>
              {lockedByName}
            </Text>
          </View>
        ) : null}
      </View>

      <Text className="text-body font-semibold text-text-hi" numberOfLines={2}>
        {item.title}
      </Text>

      {progress ? (
        <View className="mt-2.5">
          <View className="h-1.5 w-full overflow-hidden rounded-full bg-ink-raised">
            <View
              className="h-full rounded-full"
              style={{
                width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                backgroundColor: accent.color,
              }}
            />
          </View>
          <Text className="mt-1 text-meta text-text-low">
            {progress.done}/{progress.total} done
          </Text>
        </View>
      ) : null}

      {item.tags.length ? (
        <View className="mt-2.5 flex-row flex-wrap gap-1.5">
          {item.tags
            .filter((t) => !CONTEXTS.includes(t.toLowerCase() as WorkspaceContext))
            .slice(0, 3)
            .map((t) => (
              <TagChip key={t} label={t} />
            ))}
        </View>
      ) : null}

      {(item.assignees.length > 0 || due) && (
        <View className="mt-3 flex-row items-center justify-between">
          <View className="flex-row">
            {item.assignees.slice(0, 3).map((a, i) => (
              <View key={a} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                <Avatar name={a} id={a} size={22} />
              </View>
            ))}
          </View>
          {due ? (
            <View
              className="rounded-sm px-2 py-0.5"
              style={{ backgroundColor: due.overdue ? "rgba(248,113,113,0.14)" : "rgba(255,255,255,0.05)" }}
            >
              <Text
                className="text-meta"
                style={{ color: due.overdue ? palette.danger : palette.textLow }}
              >
                {due.text}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </GlassCard>
  );
}

/** A compact priority flag chip; only rendered for low/medium/high (not none). */
function PriorityPip({ priority }: { priority: number }) {
  const p = priorityMeta(priority);
  return (
    <View
      className="flex-row items-center gap-1 self-start rounded-pill border px-1.5 py-0.5"
      style={{ borderColor: `${p.color}55`, backgroundColor: `${p.color}14` }}
    >
      <FlagIcon size={10} color={p.color} strokeWidth={2.2} />
      <Text className="text-meta uppercase" style={{ color: p.color }}>
        {p.short}
      </Text>
    </View>
  );
}

export const TaskCard = memo(TaskCardBase);

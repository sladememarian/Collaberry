/**
 * Card priority — one shared source of truth for the 0–3 scale the backend
 * stores (see `services/common/collaberry_common/models.py`). Kept next to the
 * theme tokens because every priority also owns a color used across the card
 * badge and the item-screen picker.
 *
 * 0 none · 1 low · 2 medium · 3 high.
 */
import { palette } from "./tokens";

export interface PriorityMeta {
  value: number;
  label: string;
  short: string;
  color: string;
}

export const PRIORITIES: PriorityMeta[] = [
  { value: 0, label: "None", short: "—", color: palette.textLow },
  { value: 1, label: "Low", short: "Low", color: palette.blueSoft },
  { value: 2, label: "Medium", short: "Med", color: palette.warn },
  { value: 3, label: "High", short: "High", color: palette.danger },
];

export function priorityMeta(value: number | null | undefined): PriorityMeta {
  const v = Math.max(0, Math.min(3, value ?? 0));
  return PRIORITIES[v];
}
